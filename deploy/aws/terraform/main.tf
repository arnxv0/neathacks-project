# Preflight judge-facing deployment: one Graviton EC2 host (Ubuntu 24.04 arm64), Elastic IP, Caddy with TLS + basic auth
# on *.sslip.io. Everything else (target :8100, chaos proxy :8300, API :8200, Next :3000, replay targets :8101+) is loopback.
# Secrets are never in tfvars or state: the instance reads them from SSM Parameter Store at boot (see bootstrap.sh.tftpl).

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

locals {
  name = "preflight"
  tags = {
    Project   = "preflight"
    ManagedBy = "terraform"
    Purpose   = "neathack-judging"
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# AMI: Canonical Ubuntu 24.04 (noble) arm64, gp3 root
# ---------------------------------------------------------------------------------------------------------------------
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }
  filter {
    name   = "architecture"
    values = ["arm64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# Network: the account's default VPC and one of its subnets
# ---------------------------------------------------------------------------------------------------------------------
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

resource "aws_security_group" "preflight" {
  name        = "${local.name}-sg"
  description = "Preflight demo host: SSH from the admin only, HTTP/HTTPS from anywhere"
  vpc_id      = data.aws_vpc.default.id
  tags        = local.tags

  ingress {
    description = "SSH (admin)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }
  ingress {
    description = "HTTP (Caddy ACME + redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS (dashboard + API behind basic auth)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    description = "All egress (apt, installers, LiteLLM, neatlogs, Crustdata, Entire, GitHub)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# IAM: the instance may only read /preflight/* parameters (and decrypt SecureStrings). Nothing else.
# ---------------------------------------------------------------------------------------------------------------------
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "ssm_read" {
  statement {
    sid       = "ReadPreflightParameters"
    actions   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = ["arn:aws:ssm:*:*:parameter/preflight/*", "arn:aws:ssm:*:*:parameter/preflight"]
  }
  statement {
    sid       = "DecryptSecureStrings"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "preflight" {
  name               = "${local.name}-ec2"
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "ssm_read" {
  name   = "${local.name}-ssm-read"
  role   = aws_iam_role.preflight.id
  policy = data.aws_iam_policy_document.ssm_read.json
}

resource "aws_iam_instance_profile" "preflight" {
  name = "${local.name}-ec2"
  role = aws_iam_role.preflight.name
  tags = local.tags
}

# ---------------------------------------------------------------------------------------------------------------------
# SSH key, Elastic IP, instance
# ---------------------------------------------------------------------------------------------------------------------
resource "aws_key_pair" "admin" {
  key_name   = "${local.name}-admin"
  public_key = var.ssh_public_key
  tags       = local.tags
}

# The EIP is allocated first so the bootstrap can bake the final sslip.io host name into Caddy and the Next build.
resource "aws_eip" "preflight" {
  domain = "vpc"
  tags   = merge(local.tags, { Name = local.name })
}

locals {
  host = "preflight.${replace(aws_eip.preflight.public_ip, ".", "-")}.sslip.io"
}

resource "aws_instance" "preflight" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = data.aws_subnets.default.ids[0]
  vpc_security_group_ids      = [aws_security_group.preflight.id]
  iam_instance_profile        = aws_iam_instance_profile.preflight.name
  key_name                    = aws_key_pair.admin.key_name
  associate_public_ip_address = true

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 40
    delete_on_termination = true
    encrypted             = true
  }

  metadata_options {
    http_tokens = "required" # IMDSv2 only
  }

  user_data = templatefile("${path.module}/bootstrap.sh.tftpl", {
    host                = local.host
    region              = var.region
    repo_url            = var.repo_url
    git_ref             = var.git_ref
    judge_user          = var.judge_user
    judge_password_hash = var.judge_password_hash
    fixers_max_parallel = var.fixers_max_parallel
  })
  user_data_replace_on_change = true

  tags = merge(local.tags, { Name = local.name })
}

resource "aws_eip_association" "preflight" {
  instance_id   = aws_instance.preflight.id
  allocation_id = aws_eip.preflight.id
}
