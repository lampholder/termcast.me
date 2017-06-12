#!/bin/bash
fifo=`cat /dev/urandom | env LC_CTYPE=C tr -cd 'a-f0-9' | head -c 32`
mkfifo /tmp/$fifo
python stream.py /tmp/$fifo > .output &
tmux -2 -f tmux.conf new script -t0 -F /tmp/$fifo
rm -rf /tmp/$fifo
rm -rf .output
