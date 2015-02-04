#!/bin/bash

#
# Generate self signed certificate/key for SSL
#

PREFIX=~/.nodeplayer/nodeplayer
KEYNAME=$PREFIX-key.pem
CSRNAME=$PREFIX-csr.pem
CERTNAME=$PREFIX-cert.pem

openssl genrsa -out $KEYNAME 1024
openssl req -new -key $KEYNAME -out $CSRNAME
openssl x509 -req -days 10000 -in $CSRNAME -signkey $KEYNAME -out $CERTNAME

rm $CSRNAME
