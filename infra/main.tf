terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-south-1"
}

resource "aws_key_pair" "deployer" {
  key_name   = "incident-assistant-key"
  public_key = file("${path.module}/incident-assistant-key.pub")
}

resource "aws_security_group" "app_sg" {
  name        = "incident-assistant-sg"
  description = "Allow SSH, target-app, and assistant-service ports"

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

    ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Target app"
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Assistant service"
    from_port   = 8001
    to_port     = 8001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Frontend"
    from_port   = 5173
    to_port     = 5173
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "app_server" {
  ami                    = "ami-01a00762f46d584a1"
  instance_type          = "t3.micro"
  key_name               = aws_key_pair.deployer.key_name
  vpc_security_group_ids = [aws_security_group.app_sg.id]

  tags = {
    Name = "incident-assistant-server"
  }
}

resource "aws_eip" "app_server" {
  domain = "vpc"

  tags = {
    Name = "incident-assistant-eip"
  }
}

resource "aws_eip_association" "app_server" {
  instance_id   = aws_instance.app_server.id
  allocation_id = aws_eip.app_server.id
}




output "elastic_ip" {
  value = aws_eip.app_server.public_ip
}