# Runtime Proof

Date: 2026-03-08

Status: FAIL in this session

## Scope

Required baseline to re-prove:
- clean `docker compose down --remove-orphans`
- clean `docker compose up -d --build --remove-orphans`
- healthy containers for services with healthchecks
- gateway reachable at `http://127.0.0.1:8080`
- web reachable at `http://127.0.0.1:8080/login`
- `GET /health` returns `200`
- `GET /login` returns `200`

## Commands run

```powershell
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml down --remove-orphans
docker version
docker info
docker context ls
$env:DOCKER_API_VERSION='1.51'; docker version
$env:DOCKER_API_VERSION='1.50'; docker version
$env:DOCKER_API_VERSION='1.49'; docker version
Get-Process *docker* | Select-Object ProcessName,Id,MainWindowTitle
Get-Service *docker* | Select-Object Name,Status,StartType
Start-Service com.docker.service
Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
docker version
Invoke-WebRequest -Uri 'http://127.0.0.1:8080/health' -UseBasicParsing
Invoke-WebRequest -Uri 'http://127.0.0.1:8080/login' -UseBasicParsing
```

## Actual results

Compose teardown did not reach the project stack. Docker returned an engine-side API error:

```text
request returned 500 Internal Server Error for API route and version
http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/containers/json?...,
check if the server supports the requested API version
```

`docker version` returned only client information and failed on the server call:

```text
Client:
 Version:           29.2.0
 API version:       1.53
 Context:           desktop-linux
request returned 500 Internal Server Error for API route and version
http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.53/version, check if the server supports the requested API version
```

`docker info` showed the same server-side failure.

`docker context ls`:

```text
NAME              DESCRIPTION                               DOCKER ENDPOINT                             ERROR
default           Current DOCKER_HOST based configuration   npipe:////./pipe/docker_engine
desktop-linux *   Docker Desktop                            npipe:////./pipe/dockerDesktopLinuxEngine
```

Pinning lower Docker API versions `1.51`, `1.50`, and `1.49` did not restore connectivity; each call still returned the same engine-side `500`.

Windows Docker service state:

```text
Name                Status   StartType
com.docker.service  Stopped  Manual
```

Attempt to start the service from this session failed:

```text
Start-Service : Service 'Docker Desktop Service (com.docker.service)' cannot be started due to the following error:
Cannot open com.docker.service service on computer '.'
```

Launching Docker Desktop from the user session did not recover daemon connectivity. A subsequent `docker version` still failed on the server API.

Host checks failed because nothing was listening on `127.0.0.1:8080`:

```text
System.Net.Sockets.SocketException: No connection could be made because the target machine actively refused it 127.0.0.1:8080
```

This refusal occurred for both:
- `GET http://127.0.0.1:8080/health`
- `GET http://127.0.0.1:8080/login`

## Conclusion

The required runtime baseline was not re-proven in this session.

Failure cause observed in-session:
- local Docker Desktop daemon unavailable from this session
- compose commands fail before container lifecycle begins
- gateway and web host checks fail with connection refused as a downstream consequence
