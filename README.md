# termcast

**termcast** exists to make it absolutely trivial to stream the contents of your current terminal session over the web, so that you can:
- stream your terminal session so friends/collaborators/students can follow along as you grep logs, configure a webserver, play nethack, whatever.
- display a status bar showing:
 - The URL your friends need to visit to see the broadcast
 - The number of people currently following along

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

The happy path is actually working pretty well now. There are still some issues, but they mostly pertain to the running of the server. It shouldn't be too hard for you to run your own instance of the server, but there's no good documentation for that yet.

## Usages of the installed script

`$ termcast` will launch a new session identified with a dictionary word randomly selected

`$ termcast --width <width_in_columns> --height <height_in_rows>` will initiate a session with specified dimensions

`$ termcast --session <session_id> --token <session_token>` will reconnect to an existing session

Remember - viewers will see your terminal stretched to fit the size of their browser window, so very small/very large terminals could look pretty ugly.

## What's it look like?
It looks like this: https://termcast.me/saddle
  
