"""Script to establish websocket connection to the stream router."""
import io
import os
import json

import requests
from websocket import create_connection

session = requests.get('http://localhost/init').json()
os.environ['STREAM'] = session['session']

# TODO: Sort all of the mingity sleeping rubbish; there must be a better way

# FIXME: This should be in config somewhere
HOST = 'ws://' + 'localhost/' + session['session'] #'termcast.me'
TYPESCRIPT_FILENAME = '/tmp/filename'

LOCAL_ECHO = False

WS = create_connection(HOST)

BUFFER_SIZE = 1024
with io.open(TYPESCRIPT_FILENAME, 'r+b', 0) as TYPESCRIPT_FILE:
    data_to_send = ''
    while True:
        read_data = TYPESCRIPT_FILE.read(BUFFER_SIZE)
        data_to_send += read_data
        if len(read_data) < BUFFER_SIZE:
            j = json.dumps({'type': 'stream', 'msg': data_to_send.decode('utf-8', 'replace')})
            WS.send(j)
            data_to_send = ''
