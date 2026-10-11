output "public_ip" {
  description = "Elastic IP of the Preflight host."
  value       = aws_eip.preflight.public_ip
}

output "url" {
  description = "Judge-facing URL (Caddy obtains the certificate on first request; allow ~1 min after boot)."
  value       = "https://${local.host}"
}

output "ssh" {
  description = "SSH command for the admin."
  value       = "ssh ubuntu@${aws_eip.preflight.public_ip}"
}

output "bootstrap_log" {
  description = "Follow the bootstrap on the box (takes ~10 min: installers, uv sync x2, npm ci + next build)."
  value       = "ssh ubuntu@${aws_eip.preflight.public_ip} sudo tail -f /var/log/preflight-bootstrap.log"
}

output "instance_id" {
  value = aws_instance.preflight.id
}
