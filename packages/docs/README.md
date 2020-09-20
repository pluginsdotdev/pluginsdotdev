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

## Notes
We pre-create the `dist/` folder with a favicon to get around permission issues when running as non-root inside the container.
When docker creates a non-existent host directory for a volume, it creates it as root.
