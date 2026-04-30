#!/bin/bash
set -e

echo "=== Oracle VM Initial Setup ==="

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
sudo apt-get install -y docker.io docker-compose nginx certbot python3-certbot-nginx

# Add current user to docker group
sudo usermod -aG docker $USER

# Install netfilter-persistent for iptables rules
sudo apt-get install -y iptables-persistent

# Open ports in iptables (Oracle has its own firewall on top of Security Lists)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3001 -j ACCEPT
sudo netfilter-persistent save

echo "=== Firewall rules saved ==="
echo "=== IMPORTANT: Also open ports 80 and 443 in Oracle Cloud Console ==="
echo "=== Networking > Virtual Cloud Networks > Security Lists > Ingress Rules ==="

# Enable nginx
sudo systemctl enable nginx
sudo systemctl start nginx

echo "=== Done. Run 'newgrp docker' or re-login before using docker ==="
