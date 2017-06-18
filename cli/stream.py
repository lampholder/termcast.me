"""Script to establish websocket connection to the stream router."""
import io
import sys
import json
from threading import Thread

import requests
from websocket import create_connection

class Host(object):

    def __init__(self, domain, ssl=True):
        self._ssl = ssl
        self._domain = domain


    def ws(self):
        return 'ws%s://%s/' % ('s' if self._ssl else '',
                               self._domain)

    def http(self):
        return 'http%s://%s/' % ('s' if self._ssl else '',
                               self._domain)

source = Host('termcast.me', ssl=True)
source = Host('localhost', ssl=False)

session = requests.get(source.http() + 'init').json()
session_id = session['session_id']

template = ' ' + source.http() + '%s [%d watchers]\n'

sys.stdout.write(template % (session_id, 0))
sys.stdout.flush()

# FIXME: This should be in config somewhere
URL = source.ws() + session_id #'termcast.me'
WS = create_connection(URL)

TYPESCRIPT_FILENAME = sys.argv[1]

BUFFER_SIZE = 1024

def listener():
    while True:
        received = json.loads(WS.recv())
        if received['type'] == 'viewcount':
            sys.stdout.write(template % (session_id, received['msg']))
            sys.stdout.flush()

try:
    Thread(target=listener).start()
except Exception, errtxt:
    print errtxt

WS.send(json.dumps({'type': 'registerPublisher', 'msg': ''}));

with io.open(TYPESCRIPT_FILENAME, 'r+b', 0) as TYPESCRIPT_FILE:
    data_to_send = ''
    while True:
        read_data = TYPESCRIPT_FILE.read(BUFFER_SIZE)
        data_to_send += read_data
        if len(read_data) < BUFFER_SIZE:
            j = json.dumps({'type': 'stream', 'msg': data_to_send.decode('utf-8', 'replace')})
            WS.send(j)
            data_to_send = ''
