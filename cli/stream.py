"""Script to establish websocket connection to the stream router."""
import io
import os
import sys
import json
from threading import Thread

import requests
from websocket import create_connection

session = requests.get('http://localhost/init').json()

template = ' https://termcast.me/%s [%d watchers]\n'

sys.stdout.write(template % (session['session'], 0))
sys.stdout.flush()

# TODO: Sort all of the mingity sleeping rubbish; there must be a better way

# FIXME: This should be in config somewhere
HOST = 'ws://' + 'localhost/' + session['session'] #'termcast.me'
TYPESCRIPT_FILENAME = '/tmp/filename'

LOCAL_ECHO = False

WS = create_connection(HOST)

BUFFER_SIZE = 1024

def listener():
    while True:
        received = json.loads(WS.recv())
        if received['type'] == 'viewcount':
            sys.stdout.write(template % (session['session'], received['msg']))
            sys.stdout.flush()

try:
    Thread(target=listener).start()
except Exception, errtxt:
    print errtxt

with io.open(TYPESCRIPT_FILENAME, 'r+b', 0) as TYPESCRIPT_FILE:
    data_to_send = ''
    while True:
        read_data = TYPESCRIPT_FILE.read(BUFFER_SIZE)
        data_to_send += read_data
        if len(read_data) < BUFFER_SIZE:
            j = json.dumps({'type': 'stream', 'msg': data_to_send.decode('utf-8', 'replace')})
            WS.send(j)
            data_to_send = ''
