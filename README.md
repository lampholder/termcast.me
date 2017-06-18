# termcast

## Objective:

I want to build a thing where streaming your current terminal session is as easy as typing termcast.sh on your command line and it will:

- Stream the whole of your terminal session there so people can follow along as you grep logs, configure a webserver, play nethack, whatever.
- Show you a status bar showing:
 - The URL your friends need to visit to see the broadcast
 - The number of people currently following along
- Okay I've basically done these things now I just need to sand down all the crazy-rough edges

## Howsit work?

It leverages a bunch of existing unix gubbins (script, tmux, named pipes) + python and websockets and a node js server to plug it all together.

Tmux is in the mix because:

- It has a status bar that can be configured to show useful stuffs

## Current state:

Holy smokes there's a lot wrong with this thing!

- It relies on server config that _I tell you nothing about_! Hint - you want _proxy_read_timeout_ to be higher than a minute if you're using nginx!
- It just picks a random word for the session name, no override, no handling of clashes
- What is error handling?
- On that subject, it's crazy vulnerable to other people hijacking your stream! They'd have to knock you out first if they wanted exclusive, useful control, but disruption would be super easy.
- The cli is a python script and a bash wrapper and all the dependencies just have to be magically on your system okay?
 - Okay, if they're not there by magic, off the top of my head they are:
  - Python 2.thing
  - Python requests library
  - Python websockets library (yeah it's using websockets to stream typescript to browser-based js terminal emulators)
  - tmux
  - script 
  - Okay maybe _requests_ and _websockets_ are the only ones of these you don't have already, but the script should handle its own dependencies on install

Anyway, in concl. it is flaky as pastry and shouldn't be used for anything until it's received a lot more love.
  
