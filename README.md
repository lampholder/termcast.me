# termcast

**termcast** exists to make it absolutely trivial to stream the contents of your current terminal session over the web, so that friends/collaborators/students can follow along as you grep logs, configure a webserver, play nethack, whatever :)

![](https://raw.githubusercontent.com/lampholder/termcast/master/termcast.gif)

## How do I get it?

You can either git clone this repo and run the cli/termcast.py script, or (preferably) use pip. [If you don't have pip, follow the instructions to get it here](https://pip.pypa.io/en/stable/installing/). You'll also need to install tmux if you don't have it already:

    $ sudo apt-get install tmux
    $ pip install termcast --user

## How does it work?

It leverages a bunch of existing unix gubbins (script, tmux, named pipes) + python and websockets and a node js server to plug it all together.

Tmux is in the mix because:

- It has a status bar that can be configured to show useful things
- It supports specifying the dimensions of your terminal (independently of the window size)

## Current state:

**N.B.** If you see errors from tmux about configuration options, it might be that your version of tmux is old. Obviously it would be better if termcast detected and handled this automatically - it doesn't, but you can try and run it with tmux configuration options compatible with older versions of tmux by running with the `--old-tmux` flag.

The pip termcast only works on python >= 2.7.9 because earlier versions can't support SNI :(

termcast is in alpha but the happy path is actually working pretty well. There are still some issues, but they mostly pertain to the running of the server. 

Relying on my server running at termcast.me for mission critical procedures is... not recommended. The server is currently a Single Point of Failure, and could go down at any time.

## Usages of the installed script

`$ termcast` will launch a new session identified with a dictionary word randomly selected

`$ termcast --width <width_in_columns> --height <height_in_rows>` will initiate a session with specified dimensions

`$ termcast --session <session_id> --token <session_token>` will reconnect to an existing session

Remember - viewers will see your terminal stretched to fit the size of their browser window, so very small/very large terminals could look pretty ugly.

## Can I see it in action?

(Hopefully) an instance is up-and-streaming on: https://termcast.me/said
