#!/bin/bash

# AI Chat Proxy Server Startup Script with Auto-Restart
# This script will automatically restart the server if it crashes

# Configuration
SERVER_DIR="/root/simple-http-proxy"
SERVER_SCRIPT="index.js"
LOG_FILE="$SERVER_DIR/server.log"
ERROR_LOG="$SERVER_DIR/error.log"
PID_FILE="$SERVER_DIR/server.pid"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

# Function to check if server is running
check_server() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            return 0 # Server is running
        else
            print_warning "PID file exists but process is not running. Cleaning up."
            rm -f "$PID_FILE"
        fi
    fi
    return 1 # Server is not running
}

# Function to start server
start_server() {
    print_info "Starting AI Chat Proxy Server..."

    cd "$SERVER_DIR"

    # Check if already running
    if check_server; then
        print_warning "Server is already running (PID: $(cat $PID_FILE))"
        return 1
    fi

    # Start server in background
    nohup node "$SERVER_SCRIPT" >> "$LOG_FILE" 2>> "$ERROR_LOG" &
    SERVER_PID=$!

    # Save PID
    echo $SERVER_PID > "$PID_FILE"

    # Wait a bit and check if server started successfully
    sleep 3
    if ps -p $SERVER_PID > /dev/null 2>&1; then
        print_success "Server started successfully (PID: $SERVER_PID)"
        return 0
    else
        print_error "Failed to start server"
        rm -f "$PID_FILE"
        return 1
    fi
}

# Function to stop server
stop_server() {
    print_info "Stopping AI Chat Proxy Server..."

    if check_server; then
        PID=$(cat "$PID_FILE")
        print_info "Sending SIGTERM to process $PID"

        # Try graceful shutdown first
        kill -TERM "$PID"

        # Wait up to 10 seconds for graceful shutdown
        for i in {1..10}; do
            if ! ps -p "$PID" > /dev/null 2>&1; then
                print_success "Server stopped gracefully"
                rm -f "$PID_FILE"
                return 0
            fi
            sleep 1
        done

        # Force kill if graceful shutdown failed
        print_warning "Graceful shutdown failed, force killing..."
        kill -KILL "$PID"
        sleep 1
        rm -f "$PID_FILE"
        print_success "Server force killed"
    else
        print_warning "Server is not running"
    fi
}

# Function to restart server
restart_server() {
    print_info "Restarting server..."
    stop_server
    sleep 2
    start_server
}

# Function to show server status
show_status() {
    if check_server; then
        PID=$(cat "$PID_FILE")
        print_success "Server is running (PID: $PID)"

        # Show some basic stats
        if [ -f "$LOG_FILE" ]; then
            echo "Recent log entries:"
            tail -5 "$LOG_FILE" | while read line; do
                echo "  $line"
            done
        fi
    else
        print_warning "Server is not running"
    fi
}

# Function to show usage
show_usage() {
    echo "AI Chat Proxy Server Control Script"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start     - Start the server"
    echo "  stop      - Stop the server"
    echo "  restart   - Restart the server"
    echo "  status    - Show server status"
    echo "  monitor   - Monitor server with auto-restart (default)"
    echo "  logs      - Show server logs"
    echo "  tail      - Follow server logs"
    echo ""
    echo "Without arguments, the script will start monitoring mode with auto-restart."
}

# Function to monitor and auto-restart server
monitor_server() {
    print_info "Starting server monitoring with auto-restart..."

    RESTART_COUNT=0
    MAX_RESTARTS=10
    RESTART_WINDOW=600  # 10 minutes in seconds

    while true; do
        # Check if server is running
        if ! check_server; then
            RESTART_COUNT=$((RESTART_COUNT + 1))
            print_warning "Server is not running (restart attempt $RESTART_COUNT/$MAX_RESTARTS)"

            # Check if we've exceeded max restarts in time window
            if [ $RESTART_COUNT -gt $MAX_RESTARTS ]; then
                print_error "Too many restart attempts. Something is seriously wrong."
                print_error "Check server logs and fix the issue before running again."
                exit 1
            fi

            # Try to start server
            if ! start_server; then
                print_error "Failed to start server. Will retry in 10 seconds..."
                sleep 10
                continue
            fi

            RESTART_COUNT=0
        fi

        # Wait before next check
        sleep 5
    done
}

# Function to show logs
show_logs() {
    if [ -f "$LOG_FILE" ]; then
        echo "=== Server Logs ==="
        cat "$LOG_FILE"
    else
        print_warning "No log file found"
    fi

    if [ -f "$ERROR_LOG" ]; then
        echo ""
        echo "=== Error Logs ==="
        cat "$ERROR_LOG"
    fi
}

# Function to tail logs
tail_logs() {
    print_info "Following server logs (Ctrl+C to exit)..."
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE" "$ERROR_LOG"
    else
        print_warning "No log files found"
    fi
}

# Main script logic
case "${1:-monitor}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        restart_server
        ;;
    status)
        show_status
        ;;
    monitor)
        monitor_server
        ;;
    logs)
        show_logs
        ;;
    tail)
        tail_logs
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
