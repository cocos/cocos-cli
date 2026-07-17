# Platform Overview

HUAWEI AppGallery Connect (AGC) is Huawei's cloud service and distribution platform for Android games and applications. The build uses `agconnect-services.json` to associate the generated native project with an AGC application.

## Configuration

Select a valid `agconnect-services.json` in the build panel. Cocos CLI copies it to `<project>/settings/agconnect-services.json` and uses `client.package_name` from the file as the Android package name for Huawei AGC builds.

## Official Website

https://developer.huawei.com/consumer/cn/agconnect/

## Developer Documentation

https://developer.huawei.com/consumer/cn/doc/app/agc-help-agc-getstarted-0000001914313676
