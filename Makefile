.PHONY: test run install

test:
	cd backend && make test

run:
	cd backend && make run

install:
	cd backend && make install-dev
