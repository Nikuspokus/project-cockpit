.PHONY: build test clean

CC := gcc
VERSION = 1.0
URL ?= http://example.com

build: deps
	$(CC) -o app main.c

test clean:
	rm -rf out

%.o: %.c
	$(CC) -c $<

deps::
	echo deps

lint:
	echo lint

build:
	echo duplicate
