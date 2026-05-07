#!/bin/bash

set -euo pipefail

if [[ -t 1 ]]; then
    RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m'
    CYAN='\033[0;36m' WHITE='\033[1;37m' GRAY='\033[0;90m' NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' CYAN='' WHITE='' GRAY='' NC=''
fi

sites_dir="/etc/nginx/sites-available"
enabled_dir="/etc/nginx/sites-enabled"

echo ""
echo -e "  ${WHITE}Nginx Domains${NC}"
echo ""

if ! command -v nginx &>/dev/null; then
    echo -e "  ${RED}✗${NC} Nginx is not installed"
    echo ""
    exit 1
fi

if [[ ! -d "$sites_dir" ]]; then
    echo -e "  ${RED}✗${NC} ${sites_dir} not found"
    echo ""
    exit 1
fi

site_count=0

for conf in "$sites_dir"/*; do
    [[ -f "$conf" ]] || continue
    name=$(basename "$conf")
    [[ "$name" == "default" ]] && continue

    site_count=$((site_count + 1))

    enabled=false
    [[ -L "$enabled_dir/$name" ]] && enabled=true

    has_ssl=false
    domains=$(grep -oP 'server_name\s+\K[^;]+' "$conf" 2>/dev/null | head -1 | tr -s ' ')
    listens=$(grep -oP 'listen\s+\K[^;]+' "$conf" 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
    grep -qE 'listen\s+.*443|ssl_certificate' "$conf" 2>/dev/null && has_ssl=true

    if [[ "$enabled" == true ]]; then
        echo -e "  ${GREEN}●${NC} ${WHITE}${name}${NC}"
    else
        echo -e "  ${RED}●${NC} ${WHITE}${name}${NC} ${GRAY}(disabled)${NC}"
    fi

    if [[ -n "$domains" && "$domains" != "_" ]]; then
        echo -e "    Server name:  ${CYAN}${domains}${NC}"
    else
        echo -e "    Server name:  ${GRAY}_ (catch-all)${NC}"
    fi
    echo -e "    Listen:       ${WHITE}${listens}${NC}"

    if [[ "$has_ssl" == true ]]; then
        cert_domain=$(echo "$domains" | awk '{print $1}')
        if [[ -n "$cert_domain" && "$cert_domain" != "_" ]]; then
            cert_path="/etc/letsencrypt/live/${cert_domain}/fullchain.pem"
            if [[ -f "$cert_path" ]]; then
                expiry=$(openssl x509 -enddate -noout -in "$cert_path" 2>/dev/null | cut -d= -f2)
                if [[ -n "$expiry" ]]; then
                    expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null)
                    now_epoch=$(date +%s)
                    days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
                    if [[ $days_left -lt 0 ]]; then
                        echo -e "    SSL:          ${RED}expired${NC}"
                    elif [[ $days_left -lt 14 ]]; then
                        echo -e "    SSL:          ${YELLOW}expires in ${days_left}d${NC}"
                    else
                        echo -e "    SSL:          ${GREEN}valid (${days_left}d remaining)${NC}"
                    fi
                else
                    echo -e "    SSL:          ${GREEN}active${NC}"
                fi
            else
                echo -e "    SSL:          ${YELLOW}configured but certificate not found${NC}"
            fi
        fi
    fi

    for domain in $domains; do
        [[ "$domain" == "_" ]] && continue
        scheme="http"
        [[ "$has_ssl" == true ]] && scheme="https"
        url="${scheme}://${domain}"
        http_code=$(curl -sk -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 "$url" 2>/dev/null)

        if [[ -z "$http_code" || "$http_code" == "000" ]]; then
            echo -e "    ${url}  ${RED}✗ unreachable${NC}"
        elif [[ "$http_code" =~ ^[23] ]]; then
            echo -e "    ${url}  ${GREEN}✓ ${http_code}${NC}"
        else
            echo -e "    ${url}  ${YELLOW}⚠ ${http_code}${NC}"
        fi
    done
    echo ""
done

[[ $site_count -gt 0 ]] || echo -e "  ${GRAY}No sites found in ${sites_dir}${NC}"

if nginx_test=$(sudo nginx -t 2>&1); then
    echo -e "  ${GREEN}✓${NC} Nginx configuration is valid"
else
    echo -e "  ${RED}✗${NC} Nginx configuration has errors:"
    echo "$nginx_test" | sed 's/^/    /'
fi
echo ""
