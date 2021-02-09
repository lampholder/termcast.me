#!/usr/bin/python
"""Script to execute the terminal sharing."""

import io
import os
import sys
import time
import uuid
import json
import logging
import argparse
import platform
import traceback
import subprocess

from threading import Lock
from threading import Thread
from distutils import spawn

import requests
from websocket import create_connection

class Host(object):
    """Stores the host domain"""

    def __init__(self, domain, ssl=True):
        self._ssl = ssl
        self._domain = domain

    def ws(self):
        """Return the host as a websocket reference"""
        return 'ws%s://%s/' % ('s' if self._ssl else '', self._domain)

    def http(self):
        """Return the host as a http reference"""
        return 'http%s://%s/' % ('s' if self._ssl else '', self._domain)


def communicate(host, session, fifo, output, tmux_socket):
    """Handle all the bidirectional traffic"""

    #TODO: This should be in a config file.
    buffer_size = 1024

    url = host.ws() + session['id']

    container = {}
    container['connection'] = None
    container['viewers'] = 0

    connection_lock = Lock()

    out = open(output, 'w', 1)
    template = ' ' + host.http() + '%s [%d viewing]\n'

    def get_connection():
        """Fetch the current websocket, or reestablish it if it's failed"""
        # We don't have nonlocal in python 2
        # TODO: Even so this is revolting.
        with connection_lock:
            while container['connection'] is None or not container['connection'].connected:
                try:
                    logging.info('Attempting websocket connection')
                    out.write('Connecting...\n')
                    container['connection'] = create_connection(url)
                    container['connection'].send(json.dumps({'type': 'registerPublisher',
                                                             'token': session['token'],
                                                             'body': ''}))
                    logging.info('Attempt succeeded')
                    out.write(template % (session['id'], container['viewers']))
                except Exception:
                    logging.error('Attempt to create websocket connection failed')
                    logging.exception('Error getting connection')
                    retry = 10
                    for i in range(retry):
                        out.write('Connection interrupted; retrying in %d\n' % (retry - i))
                        time.sleep(1)
            return container['connection']

    def sync(target):
        """Fetch the current terminal status for a new subscriber."""
        tmux_session_state = None
        while tmux_session_state is None:
            try:
                tmux_session_state = subprocess.check_output(['tmux', '-S',
                                                              tmux_socket,
                                                              'capture-pane',
                                                              '-pe']).decode(sys.stdout.encoding)
            except subprocess.CalledProcessError:
                logging.exception('Tmux session not yet initiated')
                time.sleep(0.1)
        logging.info('Tmux session sync retrieved')
        tmux_session_state = tmux_session_state.rstrip('\n').replace('\n', '\r\n')
        if len(tmux_session_state) > 0 and tmux_session_state[-1] == '>':
            # Is this a good idea? Probably not, but the common case is upsetting me :(
            tmux_session_state += ' '
        sync_object = {'type': 'sync',
                       'token': session['token'],
                       'body': tmux_session_state,
                       'target': target,
                       'width': session['width'],
                       'height': session['height']}

        logging.info('Sending sync...')
        get_connection().send(json.dumps(sync_object))

    def listener():
        """Listen to the few messages we care about coming back down the websocket."""
        while True:
            try:
                received = json.loads(get_connection().recv())
                if received['type'] == 'viewcount':
                    container['viewers'] = received['body']
                    out.write(template % (session['id'], container['viewers']))
                if received['type'] == 'requestSync':
                    sync(target=received['requester'])

            except Exception:
                #TODO: Handle exceptions with more nuance.
                logging.exception('Exception receiving server messages')
                time.sleep(30)

    listener_thread = Thread(target=listener)
    listener_thread.daemon = True
    listener_thread.start()

    def keep_alive():
        """Websockets just love to die, esp. with ill-configured web servers. Keep small
        volumes of traffic flowing to stay active."""
        while True:
            try:
                get_connection().send(json.dumps({'type': 'keepAlive'}))
            except Exception:
                #TODO: Handle exceptions with more nuance.
                logging.exception('Exception sending keepalive')
            time.sleep(30)

    keep_alive_thread = Thread(target=keep_alive)
    keep_alive_thread.daemon = True
    keep_alive_thread.start()

    with io.open(fifo, 'r+b', 0) as typescript_fifo:
        data_to_send = bytearray()
        while True:
            read_data = bytearray(typescript_fifo.read(buffer_size))
            data_to_send += read_data
            if len(read_data) < buffer_size:
                j = json.dumps({'type': 'stream',
                                'token': session['token'],
                                'body': data_to_send.decode('utf-8', 'replace')})
                try:
                    get_connection().send(j)
                    data_to_send = bytearray()
                except Exception:
                    logging.exception('Exception streaming data to server')

def system_dependency_is_available(dependency):
    """Checks that a specified dependency is available on this machine."""
    return spawn.find_executable(dependency)

def check_requirements():
    """We need to have a few things installed on the system:
     - tmux
     - script
    """
    assert system_dependency_is_available('tmux')
    assert system_dependency_is_available('script')

def do_the_needful():
    """Main method - parse arguments, generate temp. files, get stuff done."""
    check_requirements()

    parser = argparse.ArgumentParser()
    parser.add_argument('--width', type=int, default=None)
    parser.add_argument('--height', type=int, default=None)
    parser.add_argument('--token', default=None)
    parser.add_argument('--session', default=None)
    parser.add_argument('--logfile', default=None)
    parser.add_argument('--host', default='https://termcast.me')
    parser.add_argument('--command', type=str, default='')
    parser.add_argument('--old-tmux', action="store_true", help="Experimental option to support systems with older versions of tmux installed")
    args = parser.parse_args()

    unique_id = uuid.uuid4()

    # Configure logging
    if args.logfile is not None:
        logging.basicConfig(level=logging.ERROR,
                            filename=args.logfile,
                            format='[%(asctime)s] {%(pathname)s:%(lineno)d} %(levelname)s - %(message)s',
                            datefmt='%H:%M:%S')
    else:
        logging.basicConfig(filename='/dev/null')

    logging.info('Starting...')

    prefix = '/tmp/termcast.'

    fifo = prefix + 'fifo.%s' % unique_id
    output = prefix + 'output.%s' % unique_id
    tmux_config = prefix + 'tmux_config.%s' % unique_id
    tmux_socket = prefix + 'socket.%s' % unique_id

    width, height = args.width, args.height
    if width is None:
        width = int(subprocess.check_output(['tput', 'cols']).strip().decode(sys.stdout.encoding))
    if height is None:
        height = int(subprocess.check_output(['tput', 'lines']).strip().decode(sys.stdout.encoding))

    with open(tmux_config, 'w') as tmux_config_file:
        tmux_config_file.write('\n'.join([
            "set-option -g status-left-length 70",
            "set -s escape-time 0",
            "set -g status-left '#(tail -n1 %s)'" % output,
            "set -g status-right ''",
            "set -g status-interval 1",
            "set -g default-terminal 'screen-256color'",
            "set-option -g status-position top",
            "set-window-option -g window-status-current-format ''",
            "set-window-option -g window-status-format ''"
            ]))
        if not args.old_tmux:
            tmux_config_file.write('\n')
            tmux_config_file.write('\n'.join([
                "set -g window-size manual",
            ]))
        else:
            tmux_config_file.write('\n')
            tmux_config_file.write('\n'.join([
                "set -g force-width %s" % width,
                "set -g force-height %s" % height,
            ]))

    # This gubbins sets up the fifo
    subprocess.call(['mkfifo', fifo])

    # Get the session details
    (protocol, domain) = args.host.split('://')
    host = Host(domain, ssl=(protocol == 'https'))
    if args.session is not None and args.token is not None:
        session = {'id': args.session,
                   'token': args.token,
                   'width': width,
                   'height': height}
    else:
        try:
            session = requests.get(host.http() + 'init?idGenerator=dictionary').json()
            session['width'] = width
            session['height'] = height
        except Exception as e:
            #TODO: Handle this exception with more nuance
            sys.stderr.write('Unable to make HTTP connection to %s :(\n' % host.http())
            traceback.print_exc()
            exit(1)

    os.environ['TERMCAST_URL'] = '%s/%s' % (args.host, session['id'])
    command = [part for part in args.command.split(' ')
               if part.strip() != '']

    if platform.system() == 'Darwin':
        flush = '-F'
    else:
        command = ['--command'] + command
        flush = '-f'

    if not args.old_tmux:
        proc = subprocess.Popen(['tmux', '-S', tmux_socket, '-2', '-f', tmux_config,
                                 'new', '-x%s' % width, '-y%s' % height, 'script',
                                 '-q', '-t0', flush, fifo] + command)
    else:
        proc = subprocess.Popen(['tmux', '-S', tmux_socket, '-2', '-f', tmux_config,
                                 'new', 'script',
                                 '-q', '-t0', flush, fifo] + command)

    comms_thread = Thread(target=communicate, args=(host, session, fifo, output, tmux_socket))
    comms_thread.daemon = True
    comms_thread.start()

    proc.communicate()

    # Tidy up after ourselves.
    for mess in [fifo, tmux_config, output, tmux_socket]:
        if mess is not None:
            os.remove(mess)

    print("You have disconnected from your broadcast session.")
    print("To reconnect, run:")
    print("")
    print("termcast --host %s --session %s --token %s --width %s --height %s" % (args.host,
                                                                                 session['id'], 
                                                                                 session['token'],
                                                                                 session['width'],
                                                                                 session['height']))


if __name__ == "__main__":
    do_the_needful()
