#!/bin/bash
mkfifo /tmp/filename
python stream.py &
tmux -2 -f tmux.conf new script -t0 -F /tmp/filename
rm -rf /tmp/filename
