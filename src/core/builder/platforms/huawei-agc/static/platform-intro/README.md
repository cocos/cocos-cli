# Platform Overview

HUAWEI AppGallery Connect (AGC) provides cloud services and distribution capabilities for Android games and applications published through AppGallery. The build uses the `agconnect-services.json` configuration file to associate the generated native project with an AGC application.

## Configuration

Select a valid `agconnect-services.json` file in the build panel. Cocos CLI copies it into `<project>/settings/agconnect-services.json` and uses `client.package_name` from that file as the Android package name for the Huawei AGC build.

## Official Website

https://developer.huawei.com/consumer/en/agconnect/

## Developer Documentation

https://developer.huawei.com/consumer/en/doc/app/agc-help-agc-getstarted-0000001914313676
