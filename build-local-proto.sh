./protoc3/bin/protoc \
		--plugin=./node_modules/.bin/protoc-gen-ts_proto \
		--ts_proto_opt=esModuleInterop=true,returnObservable=false,outputServices=generic-definitions \
		--ts_proto_out="$(pwd)/src" -I="$(pwd)" \
		"$(pwd)/friendships_ea.proto"
