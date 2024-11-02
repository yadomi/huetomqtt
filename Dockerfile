FROM denoland/deno:alpine-1.45.5

WORKDIR /app

COPY deno.lock .

COPY main.ts .
COPY types.ts .

RUN deno cache main.ts

# FIXME: use actual certificate
CMD ["run", "--allow-net", "--allow-env", "--allow-read", "--unsafely-ignore-certificate-errors", "main.ts"]
