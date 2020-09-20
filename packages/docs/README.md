# `@pluginsdotdev/docs`

## Usage

To view docs locally:

```bash
CURRENT_USER="$UID" docker-compose run --rm --service-ports slate-serve
```

To generate docs into the `dist/` folder:

```bash
CURRENT_USER="$UID" docker-compose run --rm --service-ports slate-build
```
