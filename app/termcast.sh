#!/bin/bash
mkfifo /tmp/filename
python stream.py &
#script -t0 -F /tmp/filename tmux -f tmux.conf
