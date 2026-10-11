variable "region" {
  description = "AWS region (prices in deploy/aws/README.md are us-east-1)."
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "Graviton instance size. t4g.small = dashboard + find-only runs, no fixers; t4g.medium = everything with 2 fixers (default); t4g.large = 3 fixers."
  type        = string
  default     = "t4g.medium"

  validation {
    condition     = can(regex("^[a-z][0-9]+g[a-z]*\\.", var.instance_type))
    error_message = "Use an arm64 (Graviton) instance type such as t4g.medium; the AMI is arm64."
  }
}

variable "admin_cidr" {
  description = "CIDR allowed to SSH (your IP, e.g. 203.0.113.4/32)."
  type        = string

  validation {
    condition     = can(cidrhost(var.admin_cidr, 0))
    error_message = "admin_cidr must be a CIDR such as 203.0.113.4/32."
  }
}

variable "ssh_public_key" {
  description = "OpenSSH public key for the admin user `ubuntu` (contents of ~/.ssh/id_ed25519.pub)."
  type        = string
}

variable "judge_user" {
  description = "Basic-auth user name the judges log in with."
  type        = string
  default     = "judge"
}

variable "judge_password_hash" {
  description = "bcrypt hash of the judges' password, from `caddy hash-password` (or `docker run --rm caddy caddy hash-password`). Never the plain password."
  type        = string
  sensitive   = true

  validation {
    condition     = startswith(var.judge_password_hash, "$2")
    error_message = "judge_password_hash must be a bcrypt hash starting with $2 (output of `caddy hash-password`)."
  }
}

variable "git_ref" {
  description = "Branch, tag or SHA of the Preflight repo to deploy."
  type        = string
  default     = "main"
}

variable "fixers_max_parallel" {
  description = "config.yaml fixers.max_parallel on the host. 2 fits t4g.medium (4 GB + 2 GB swap); 3 needs t4g.large; 0 for t4g.small."
  type        = number
  default     = 2
}

variable "repo_url" {
  description = "Public clone URL of the Preflight repo."
  type        = string
  default     = "https://github.com/arnxv0/neathacks-project.git"
}
