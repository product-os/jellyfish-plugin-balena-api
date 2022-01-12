# Jellyfish Balena API Plugin

Provides a sync integration for Balena API.

# Usage

Below is an example how to use this library:

```js
import { cardMixins } from '@balena/jellyfish-core';
import { BalenaAPIPlugin } from '@balena/jellyfish-plugin-balena-api';

const plugin = new BalenaAPIPlugin();

// Load cards from this plugin, can use custom mixins
const cards = plugin.getCards(context, cardMixins);
console.dir(cards);
```

# Documentation

[![Publish Documentation](https://github.com/product-os/jellyfish-plugin-balena-api/actions/workflows/publish-docs.yml/badge.svg)](https://github.com/product-os/jellyfish-plugin-balena-api/actions/workflows/publish-docs.yml)

Visit the website for complete documentation: https://product-os.github.io/jellyfish-plugin-balena-api

# Testing

Unit tests can be easily run with the command `npm test`.

The integration tests require Postgres and Redis instances. The simplest way to run the tests locally is with `docker-compose`.

```
$ git secret reveal
$ npm run test:compose
```

You can also run tests locally against Postgres and Redis instances running in `docker-compose`:
```
$ git secret reveal
$ npm run compose
$ export INTEGRATION_BALENA_API_PRIVATE_KEY=$(cat .balena/secrets/integration_balena_api_private_key)
$ export INTEGRATION_BALENA_API_PUBLIC_KEY_PRODUCTION=$(cat .balena/secrets/integration_balena_api_public_key_production)
$ REDIS_HOST=localhost POSTGRES_HOST=localhost npm run test:integration
```

You can also access these Postgres and Redis instances:
```
$ PGPASSWORD=docker psql -hlocalhost -Udocker
$ redis-cli -h localhost
```