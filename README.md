# pluginsdotdev
Plugins.dev gives your app superpowers: allow your users to safely add 3rd party plugins to your site and let plugin authors extend your functionality and make you money.

# Development
We run our development through [Docker](https://docker.com) (specifically, docker-compose) to have a consistent environment. All commands are prefixed with `CURRENT_USER="$UID" docker-compose run --rm npm`.

We use [lerna](https://github.com/lerna/lerna#readme) to manage the packages contained in this repository.

We use [husky](https://github.com/typicode/husky#readme) to manage our git hooks (we run linting and prettier on commit).

* To install all dependencies: `CURRENT_USER="$UID" docker-compose run --rm npm install`
* To build all packages: `CURRENT_USER="$UID" docker-compose run --rm npm run lerna run build`
* To create a well-formatted git commit: `CURRENT_USER="$UID" docker-compose run --rm npm run commit`
* To bootstrap cross-package links: `CURRENT_USER="$UID" docker-compose run --rm npm run lerna bootstrap`
* To run all tests: `CURRENT_USER="$UID" docker-compose run --rm npm run lerna run test`
