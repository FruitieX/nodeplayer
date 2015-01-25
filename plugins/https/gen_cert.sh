#!/bin/bash

#
# Generate self signed certificate/key for SSL
#

NAME=partyplay
KEYNAME=$NAME-key.pem
CSRNAME=$NAME-csr.pem
CERTNAME=$NAME-cert.pem

openssl genrsa -out $KEYNAME 1024
openssl req -new -key $KEYNAME -out $CSRNAME
openssl x509 -req -days 10000 -in $CSRNAME -signkey $KEYNAME -out $CERTNAME

rm $CSRNAME
