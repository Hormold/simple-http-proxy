# Troubleshooting Guide

## WebSocket Connection Issues

### Error Code 1006 - Abnormal Closure

**Symptoms:**
- Client shows: `🔌 Connection closed: 1006 -`
- Tunnel disconnects unexpectedly
- Ping/pong works but connection still drops
- No obvious error messages

**Possible Causes:**

#### 1. Server Crashed or Restarted
```bash
# Check if server is running
ps aux | grep node

# Check server logs
tail -f server.log
tail -f error.log
```

**Solutions:**
- Restart server using control script: `./start-server.sh restart`
- Check server resource usage: `htop` or `top`
- Look for out-of-memory errors in logs

#### 2. Network Connectivity Issues
```bash
# Test network connectivity
ping aimodelproxy.com
traceroute aimodelproxy.com

# Check if port is open
nc -zv aimodelproxy.com 80
nc -zv aimodelproxy.com 443
```

**Solutions:**
- Check internet connection
- Verify firewall settings
- Test with different network if possible

#### 3. WebSocket Server Not Responding
```bash
# Test WebSocket endpoint directly
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     -H "Sec-WebSocket-Version: 13" \
     ws://aimodelproxy.com/_ws/tunnel
```

**Solutions:**
- Check server logs for WebSocket errors
- Verify WebSocket server configuration
- Restart WebSocket server component

#### 4. Firewall Blocking Connection
```bash
# Check firewall rules
sudo ufw status
sudo iptables -L

# Check if port 80/443 is open
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :443
```

**Solutions:**
- Open ports 80 and 443 in firewall
- Configure reverse proxy properly
- Check cloud firewall settings (AWS, DigitalOcean, etc.)

#### 5. Reverse Proxy Timeout
If using nginx, Apache, or other reverse proxy:

```nginx
# nginx configuration
location /_ws/tunnel {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Increase timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

**Solutions:**
- Increase timeout values in reverse proxy config
- Add proper WebSocket headers
- Reload/restart reverse proxy

#### 6. DNS Resolution Issues
```bash
# Test DNS resolution
nslookup aimodelproxy.com
dig aimodelproxy.com

# Check local DNS configuration
cat /etc/resolv.conf
```

**Solutions:**
- Verify DNS records are correct
- Clear local DNS cache: `sudo systemd-resolve --flush-caches`
- Use different DNS servers (8.8.8.8, 1.1.1.1)

#### 7. Ping/Pong Works But Connection Drops

**Symptoms:**
- You see ping/pong messages in logs
- Connection still closes with 1006
- Usually happens after 1-2 minutes

**Possible Causes:**

**Server Resource Exhaustion:**
```bash
# Check server resources
top
free -h
df -h

# Check Node.js memory usage
ps aux | grep node
```

**Network Interruption:**
```bash
# Test network stability
ping -c 10 aimodelproxy.com
mtr aimodelproxy.com

# Check for packet loss
traceroute aimodelproxy.com
```

**Reverse Proxy Timeout:**
```nginx
# nginx configuration
location /_ws/tunnel {
    proxy_pass wss://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;

    # Increase ALL timeouts
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    client_body_timeout 300s;
    client_header_timeout 300s;
}

# Also check these settings
keepalive_timeout 300s;
proxy_connect_timeout 300s;
```

**Solutions:**
- Increase all timeout values in reverse proxy
- Monitor server resource usage
- Check network stability
- Consider using longer ping intervals
- Check for firewall connection limits

### Debugging Steps

1. **Enable Debug Logging:**
```bash
export LOG_LEVEL=DEBUG
./start-server.sh restart
```

2. **Check Resource Usage:**
```bash
# Memory usage
free -h

# CPU usage
top -p $(pgrep node)

# Disk space
df -h
```

3. **Monitor Network Traffic:**
```bash
# Install tcpdump if needed
sudo apt-get install tcpdump

# Monitor WebSocket traffic
sudo tcpdump -i any port 80 or port 443 -w websocket.pcap
```

4. **Test with Different Client:**
```bash
# Test with simple WebSocket client
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('wss://aimodelproxy.com/_ws/tunnel?subdomain=test');
ws.on('open', () => console.log('Connected'));
ws.on('close', (code, reason) => console.log('Closed:', code, reason.toString()));
ws.on('error', (err) => console.log('Error:', err.message));
"
```

### Common Solutions

#### For Server Issues:
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=2048"
./start-server.sh restart

# Enable core dumps for debugging
ulimit -c unlimited
```

#### For Network Issues:
```bash
# Disable firewall temporarily for testing
sudo ufw disable

# Test with different port
export PORT=3000
./start-server.sh restart
```

#### For SSL/TLS Issues:
```bash
# Test SSL certificate
openssl s_client -connect aimodelproxy.com:443 -servername aimodelproxy.com

# Check certificate expiration
echo | openssl s_client -connect aimodelproxy.com:443 2>/dev/null | openssl x509 -noout -dates
```

### Getting Help

If the issue persists:

1. **Collect Debug Information:**
   - Server logs (`server.log`, `error.log`)
   - System resource usage (`top`, `free -h`)
   - Network connectivity (`ping`, `traceroute`)
   - WebSocket client logs

2. **Check the Metrics Endpoint:**
   ```bash
   curl http://aimodelproxy.com/api/metrics
   ```

3. **Test Different Scenarios:**
   - Different subdomain names
   - Different client locations
   - Different network conditions

4. **Server Configuration:**
   - Check environment variables
   - Verify port configurations
   - Test without reverse proxy first
