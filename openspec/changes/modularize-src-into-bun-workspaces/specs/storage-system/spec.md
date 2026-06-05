# storage-system

## Purpose
提供存储抽象、KV、文件、对象存储适配。

## Requirements

### R-1 Abstraction
系统 SHALL 定义 Storage 接口：get/put/delete/list。

### R-2 Adapters
系统 SHALL 内置 local-fs、sqlite、s3 三个 adapter。

### R-3 Key naming
系统 SHALL 用统一 key convention（`<namespace>/<id>`）。

### R-4 Atomicity
系统 SHALL 保证写操作的原子性（write-then-rename / DB tx）。

## Scenarios

### S-1 Local + S3 swap
- **GIVEN** 配置从 local 切到 s3
- **WHEN** session 写入
- **THEN** 数据 SHALL 落到 s3 bucket 且 key 一致
