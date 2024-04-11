PROTOBUF_VERSION = 3.19.1
PROTOC ?= protoc
UNAME := $(shell uname)
PROTO_FILES := $(wildcard src/*.proto)
export PATH := ts-server/node_modules/.bin:/usr/local/include/:protoc3/bin:$(PATH)

ifeq ($(UNAME),Darwin)
PROTOBUF_ZIP = protoc-$(PROTOBUF_VERSION)-osx-x86_64.zip
else
PROTOBUF_ZIP = protoc-$(PROTOBUF_VERSION)-linux-x86_64.zip
endif

# for ts
install_compiler:
	@# remove local folder
	rm -rf protoc3 || true

	@# Make sure you grab the latest version
	curl -OL https://github.com/protocolbuffers/protobuf/releases/download/v$(PROTOBUF_VERSION)/$(PROTOBUF_ZIP)

	@# Unzip
	unzip $(PROTOBUF_ZIP) -d protoc3
	@# delete the files
	rm $(PROTOBUF_ZIP)

	@# move protoc to /usr/local/bin/
	chmod +x protoc3/bin/protoc

build: install_compiler
	@./build-local-proto.sh
