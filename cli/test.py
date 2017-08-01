"""Docstrings are cool"""
import os
import uuid
import subprocess
import argparse

def do_the_needful():
    """Do the needful"""
    parser = argparse.ArgumentParser()
    parser.add_argument('--width', type=int, default=None)
    parser.add_argument('--height', type=int, default=None)
    args = parser.parse_args()

    unique_id = uuid.uuid4()

    prefix = '/tmp/termcast.'

    fifo = prefix + 'fifo.%s' % unique_id
    tmux_config = prefix + 'tmux_config.%s' % unique_id
    output = prefix + 'output.%s' % unique_id
    tmux_socket = prefix + 'socket.%s' % unique_id

    width, height = args.width, args.height
    if width is None:
        width = subprocess.check_output(['tput', 'cols']).strip()
    if height is None:
        height = subprocess.check_output(['tput', 'lines']).strip()

    with open(tmux_config, 'w') as tmux_config_file:
        tmux_config_file.write('\n'.join([
            "set-option -g status-left-length 70",
            "set -g status-left '#(tail -n1 %s)'" % output,
            "set -g status-right ''",
            "set -g status-interval 1",
            "set -g default-terminal 'screen-256color'",
            "set -g force-width %s" % width,
            "set -g force-height %s" % height,
            "set-option -g status-position top",
            "set-window-option -g window-status-current-format ''",
            "set-window-option -g window-status-format ''"]))

    subprocess.call(['mkfifo', fifo])
    print 'tmux -S %s -2 -f %s new script -q -t0 -F %s' % (tmux_socket, tmux_config, fifo)
    out = open(output, 'w')
    subprocess.Popen(['python', 'stream.py', fifo, height, width], stdout=out)
    subprocess.call(['tmux', '-S', tmux_socket, '-2', '-f', tmux_config,
                     'new', 'script', '-q', '-t0', '-F', fifo])

    for f in [fifo, tmux_config, output, tmux_socket]:
        os.remove(f)

if __name__ == "__main__":
    do_the_needful()
