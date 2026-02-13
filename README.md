# ros-cdr-typescript

TypeScript client and CDR serialization utilities for [ros_cdr_bridge](https://github.com/eyr1n/ros_cdr_bridge).

This repository provides:

- `@eyr1n/ros-cdr-client`: WebSocket client for ROS 2 CDR bridge
- `@eyr1n/ros-cdr-serialization`: message/schema helpers and CDR encode/decode
- `@eyr1n/ros-cdr-examples`: runnable talker/listener/service examples

## Requirements

- Node.js 22+
- pnpm 10+
- A running [ros_cdr_bridge](https://github.com/eyr1n/ros_cdr_bridge) server (default: `ws://127.0.0.1:9090`)

## Install

```bash
pnpm install
```

## Build

```bash
pnpm build
```

## Test

```bash
pnpm test
```

## Run examples

```bash
pnpm --filter @eyr1n/ros-cdr-examples talker
pnpm --filter @eyr1n/ros-cdr-examples listener
pnpm --filter @eyr1n/ros-cdr-examples add-two-ints
```

To use a non-default bridge endpoint:

```bash
pnpm --filter @eyr1n/ros-cdr-examples talker -- ws://127.0.0.1:8766
```
