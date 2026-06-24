# Local one-command deploy

This project deploys the compiled `build` directory to the Synology NAS and restarts the existing Node Docker container. It does not upload or rebuild a Docker image.

## First-time setup

1. Enable SSH on Synology DSM.
2. Make sure your machine can run `ssh`, `scp`, and `tar`.
3. Find the container name on the NAS:

```sh
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

4. Edit the defaults at the top of `scripts/deploy.ps1` for Windows or `scripts/deploy-mac.sh` for macOS, or pass them as command parameters.

Required values:

```powershell
$NasHost = "192.168.1.10"
$SshPort = 24
$NasUser = "your-nas-user"
$RemoteAppDir = "/volume1/docker/jdy_backend"
$ContainerName = "your-node-container"
```

## Run deploy

After configuring the script:

```powershell
npm run deploy
```

On macOS:

```sh
npm run deploy:mac
```

Legacy SCP mode and sudo Docker restart are enabled by default for this Synology setup, so normal deploy is:

```powershell
npm run deploy
```

To run remote checks before deploying:

```powershell
npm run deploy -- -Preflight -SkipBuild
```

On macOS:

```sh
npm run deploy:mac -- -Preflight -SkipBuild
```

If Synology's Docker CLI is installed outside the default SSH path, pass it explicitly:

```powershell
npm run deploy -- -RemoteDockerCommand "/usr/local/bin/docker"
```

On macOS:

```sh
npm run deploy:mac -- -RemoteDockerCommand "/usr/local/bin/docker"
```

To turn either default off for troubleshooting:

```powershell
npm run deploy -- -LegacyScp:$false -UseSudoForDocker:$false
```

On macOS:

```sh
npm run deploy:mac -- -LegacyScp false -UseSudoForDocker false
```

The script reuses one SSH connection by default, so the upload and remote deploy steps should not ask for the SSH password repeatedly. If your local OpenSSH does not support connection reuse, disable it:

```powershell
npm run deploy -- -NoSshMultiplex
```

On macOS:

```sh
npm run deploy:mac -- -NoSshMultiplex
```

Or pass values without editing the script:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 `
  -NasHost "192.168.1.10" `
  -SshPort 24 `
  -NasUser "your-nas-user" `
  -RemoteAppDir "/volume1/docker/jdy_backend" `
  -ContainerName "your-node-container"
```

On macOS:

```sh
npm run deploy:mac -- \
  -NasHost "192.168.1.10" \
  -SshPort 24 \
  -NasUser "your-nas-user" \
  -RemoteAppDir "/volume1/docker/jdy_backend" \
  -ContainerName "your-node-container"
```

The script will:

1. Run `npm run build`.
2. Compress the local `build` directory.
3. Upload `build.tar.gz` to the NAS.
4. Move the old remote `build` into `.deploy-backup`.
5. Extract the new `build`.
6. Restart the configured Docker container.

If extraction or Docker restart fails, the script tries to restore the previous remote `build` directory.
