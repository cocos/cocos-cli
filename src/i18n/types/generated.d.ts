// Auto-generated i18n types for Node.js - DO NOT EDIT MANUALLY
// Generated at: 2025-10-23T03:53:15.323Z

export interface I18nResources {
  assets: {
    title: string;
    description: string;
    deprecatedTip: string; // 参数: {oldName, version, newName}
    globalReadonlyTip: string; // 参数: {name}
    'debug-mode': string;
    assetDBPauseTips: string; // 参数: {operate}
    assetDBInitError: string;
    saveAsset: {
      fail: {
        unknown: string;
        uuid: string;
        asset: string; // 参数: {asset}
        content: string;
        readonly: string;
      };
    };
    saveAssetMeta: {
      fail: {
        unknown: string;
        uuid: string;
        content: string;
        readonly: string;
      };
    };
    init: {
      noAssetDBList: string;
    };
    operation: {
      invalid_url: string;
      exists_url: string;
      readonly: string;
      overwrite: string;
    };
    deleteAsset: {
      fail: {
        unknown: string;
        url: string;
        unexist: string;
        readonly: string;
      };
    };
    createAsset: {
      title: string;
      fail: {
        unknown: string; // 参数: {target}
        type: string; // 参数: {type}
        url: string; // 参数: {url}
        exist: string;
        drop: string; // 参数: {target}
        toUrl: string; // 参数: {target}
        uuid: string; // 参数: {target}
      };
    };
    importAsset: {
      metaExists: string; // 参数: {name}
    };
    openAsset: {
      preferenceProgramWarning: string; // 参数: {preferences, program, scriptEditor}
      fail: {
        noAsset: string;
      };
    };
    copyAsset: {
      fail: {
        unknown: string;
        url: string;
      };
    };
    restoreAssetDBFromCacheInValid: {
      upgrade: string;
      noLibraryPath: string;
    };
    preferences: {
      log_level: string;
      log_level_debug: string;
      log_level_log: string;
      log_level_warn: string;
      log_level_error: string;
      ignore_glob: string;
      ignore_changed: string;
    };
  };
  builder: {
    title: string;
    description: string;
    create_user_template: string;
    build_config: string;
    build: string;
    compile: string;
    open_log_file: string;
    generate_engine: string;
    require: string;
    new_build_task: string;
    empty_task_holder: string;
    empty_scene: string;
    empty_platforms: string;
    reveal_in_explorer: string;
    view_build_config: string;
    recompile: string;
    confirm: string;
    use_splash_screen: string;
    bundleCommonChunk: string;
    bundleCommonChunkTips: string;
    tips: {
      enter_name: string;
      taskName: string;
      build_path: string;
      build_scenes: string;
      set_start_scene: string;
      atlas_in_resources: string; // 参数: {info, root}
      use_texture_in_atlas: string; // 参数: {info, useInfo}
      use_image_in_atlas: string; // 参数: {info, useInfo}
      task_exist: string; // 参数: {taskName}
      task_busy: string;
      platform_missing: string; // 参数: {platform}
      conflict_platform: string; // 参数: {pkgName}
      waiting_for_remove_task: string;
      waiting_for_db_ready: string;
      waiting_for_plugin_ready: string;
      waiting_for_worker_ready: string;
      waiting_for_data_ready: string;
      scene_in_bundle: string;
      create_application_template_success: string;
      create_application_template_overwrite: string;
      applicationEjsVersion: string;
      setSplashSetting: string;
      buildTaskCanceled: string;
      pauseAssetImport: string;
      disablePlatform: string; // 参数: {platform}
      disablePlatformForBuildCommand: string; // 参数: {platform}
      disableRegisterPlatformInfo: string; // 参数: {platform}
      platformInformationInvalid: string; // 参数: {platform}
      createTemplateSuccess: string;
      templateVersionWarning: string; // 参数: {platform, version, internalConfig}
      buildPackageMissing: string; // 参数: {dest}
    };
    error: {
      build_error: string;
      build_dir_not_exists: string; // 参数: {buildDir}
      build_path_contains_space: string;
      buildPathContainsChineseAndSymbol: string;
      can_not_empty: string;
      project_name_not_legal: string;
      package_name_not_legal: string;
      package_name_start_with_number: string;
      select_scenes_to_build: string;
      path_too_long_title: string;
      path_too_long_desc: string; // 参数: {max_length}
      keep_raw_texture_of_atlas: string; // 参数: {texturePath, pacPath, assetPath}
      run_hooks_failed: string; // 参数: {pkgName, funcName}
      cache_compress_texture_missing: string; // 参数: {format, path}
      deserialize_failed: string; // 参数: {url}
      missing_import_files: string; // 参数: {path, url}
      required_asset_missing: string; // 参数: {fatherUrl, uuid}
      missing_asset: string; // 参数: {uuid}
      check_options_failed: string;
      unknown_platform: string;
      asset_import_failed: string; // 参数: {asset({url, type}
      get_asset_json_failed: string; // 参数: {asset({url}
      builder_crash: string;
      texture_compress_failed: string; // 参数: {asset, type, toolsPath, toolHomePage}
      missingSplashTips: string; // 参数: {splashScreen}
      invalidStartScene: string;
      missingScenes: string; // 参数: {url}
      bundleConfigs: string;
      platformRegisterError: string; // 参数: {platform}
      checkFailed: string; // 参数: {key, value, error}
      engineModulesConfigKeyMissing: string;
    };
    warn: {
      no_defined_in_i18n: string; // 参数: {name}
      no_serialized_json: string; // 参数: {url, type}
      same_load_url: string; // 参数: {urlA, urlB, url}
      atlas_in_resources: string; // 参数: {url, root}
      path_not_exist: string;
      http: string;
      required: string;
      no_chinese: string;
      checkFailedWithNewValue: string; // 参数: {key, value, error, newValue}
      compress_rgb_a: string; // 参数: {uuid}
      assetBundleIsRemoteInvalid: string; // 参数: {directoryName}
      requireMipmaps: string; // 参数: {effectUUID, textureUUID}
      invalidCustomSplash: string;
      invalidRemoveSplash: string;
      exceptionRemoveSplash: string;
      deprecatedTip: string; // 参数: {oldName, newName}
      resourcesRemoteLockWaring: string;
      repeatAtlasInBundle: string; // 参数: {asset({Atlas, bundle1, bundle2}
      engineModulesFallBackTip: string; // 参数: {fallbackMsg, platform}
      invalidOptionInSeparateEngine: string;
      separateEngineWithCustomEngine: string;
      invalidVersionInSeparateEngine: string;
    };
    tasks: {
      build_asset: string;
      build_engine: string;
      build_img: string;
      build_json: string;
      build_atlas: string;
      build_script: string;
      build_project_script: string;
      build_suffix: string;
      build_template: string;
      build_zip_bundle: string;
      load_script: string;
      sort_asset: string;
      build_import_map: string;
      sort_import_map: string;
      sort_asset_bundle: string;
      sort_image: string;
      sort_script: string;
      sort_sprite_frame: string;
      sort_texture: string;
      sort_json: string;
      settings: {
        cache: string;
        options: string;
        design_resolution: string;
        group: string;
        md5: string;
        scene: string;
        script: string;
        init: string;
        macro: string;
      };
      postprocess: {
        compress: string;
        save_config: string;
        save_settings: string;
      };
    };
    asset_bundle: {
      is_bundle: string;
      bundle_name: string;
      priority: string;
      priority_tooltip: string;
      compression_type: string;
      compression_type_tooltip: string;
      target_platform: string;
      target_platform_tooltip: string;
      is_remote_bundle: string;
      remote_bundle_invalid_tooltip: string;
      none: string;
      none_tooltip: string;
      subpackage: string;
      subpackage_tooltip: string;
      merge_dep: string;
      merge_dep_tooltip: string;
      merge_all_json: string;
      merge_all_json_tooltip: string;
      zip: string;
      zip_tooltip: string;
      duplicate_name_message: string; // 参数: {name, url}
      duplicate_name_messaged_auto_rename: string; // 参数: {newUrl, name, url, newName}
      duplicate_reserved_keyword_message: string; // 参数: {name}
      nest_bundle: string; // 参数: {url}
      filterConfig: {
        title: string;
        add: string;
        preview: string;
        addAsset: string;
        include: string;
        exclude: string;
        asset: string;
        url: string;
        glob: string;
        globTips: string;
        beginWith: string;
        endWith: string;
        contain: string;
        emptyConfig: string;
        previewList: string;
        previewTips: string;
        emptyPreviewList: string;
      };
      emptyBundle: string;
      bundleBuildTips: string;
      bundleBuildPlatformTips: string; // 参数: {bundleUrl}
      buildBundle: string;
      publishConfig: string;
      buildBundleINProcess: string;
      bundleBuildCloseTip: string;
      buildBundleBusy: string;
      buildBundleParams: string;
      bundleConfig: string;
      exportBundleBuildConfig: string;
      preferredOptions: string;
      preferredOptionsTips: string;
      fallbackOptions: string;
      fallbackOptionsTips: string;
      platformOverride: string;
      platformOverrideEmptyTip: string;
      defaultConfig: string;
      native: string;
      web: string;
      minigame: string;
      importConfig: string;
      exportConfig: string;
      previewSetting: string;
      platform: string;
      platformConfig: string;
      editConfig: string;
      addConfig: string;
      deleteConfig: string;
      targetPlatform: string;
      isRemoteFallbackTips: string;
      reset: string;
      resetUni: string;
      separateConfig: string;
      allMiniGames: string;
      uniConfig: string;
      true: string;
      false: string;
      overwrite: string;
      merge: string;
    };
    project: {
      texture_compress: {
        title: string;
        compress_preset: string;
        custom_format: string;
        same_config_name: string;
        addConfig: string;
        editConfigName: string;
        export_config: string;
        import_config: string;
        import_config_options: string;
        merge: string;
        presetName: string;
        addFormat: string;
        compressFormat: string;
        mipmap: {
          noPowerOfTwo: string;
        };
        tips: {
          require_object: string;
          require_name: string;
          xx_require_object: string; // 参数: {name}
          platform_err: string; // 参数: {platform, supportPlatforms}
          texture_type_err: string; // 参数: {format, supportFormats}
          options_quality_type_err: string; // 参数: {userQualityType, qualityType, qualityTypeOptions}
          number_quality_type_err: string; // 参数: {userQualityType, min, max}
          import_failed: string;
          user_preset_err: string;
          enter_config_name_to_add: string;
          input_config_name_to_search: string;
        };
      };
      splashSetting: {
        title: string;
        confirm: string;
        settings: {
          totalTime: string;
          displayRatio: string;
          autoFit: string;
          watermarkLocation: string;
          logo: {
            title: string;
            default: string;
            none: string;
            custom: string;
          };
          background: {
            title: string;
            default: string;
            color: string;
            custom: string;
            customTips: string; // 参数: {fitWidth, fitHeight}
          };
        };
        custom: string;
        default: string;
        disabled: string;
        watermarkLocationConfig: {
          top: string;
          bottom: string;
          left: string;
          right: string;
          center: string;
        };
        preview: string;
        totalTimeTips: string;
        displayRatioTips: string;
        tips: string;
        selectImage: string;
        useDefaultTip: string;
        enableCustomSplash: string;
        reset: string;
        previewInBrowser: string;
        informationDialogUnusual: string;
      };
    };
    example: string;
    platforms: {
      native: {
        title: string;
        encrypt: {
          disable_tips: string;
        };
      };
      mac: {
        title: string;
        error: {
          m1_with_physic_x: string;
        };
      };
    };
  };
  common: {
    loading: string;
    success: string;
    error: string;
    warning: string;
    info: string;
    confirm: string;
    cancel: string;
    ok: string;
    yes: string;
    no: string;
    save: string;
    delete: string;
    edit: string;
    create: string;
    update: string;
    refresh: string;
    close: string;
    open: string;
    back: string;
    next: string;
    previous: string;
    finish: string;
    start: string;
    stop: string;
    pause: string;
    resume: string;
    deprecatedTip: string;
  };
  importer: {
    invalidNodeData: string; // 参数: {asset({assetUuid, type, value}
    node: string;
    component: string;
    sharpError: string;
    glTF: {
      glTF_asset_group_mesh: string;
      glTF_asset_group_animation: string;
      glTF_asset_group_node: string;
      glTF_asset_group_skin: string;
      glTF_asset_group_sampler: string;
      glTF_asset: string; // 参数: {group, index, name}
      glTF_asset_no_name: string; // 参数: {group, index}
      unsupported_alpha_mode: string; // 参数: {material, mode}
      unsupported_texture_parameter: string; // 参数: {texture, sampler, type, value}
      texture_parameter_min_filter: string;
      texture_parameter_mag_filter: string;
      unsupported_channel_path: string; // 参数: {animation, channel, path}
      reference_skin_in_different_scene: string; // 参数: {node, skin}
      disallow_cubic_spline_channel_split: string; // 参数: {animation, channel}
      failed_to_calculate_tangents_due_to_lack_of_normals: string; // 参数: {mesh, primitive}
      failed_to_calculate_tangents_due_to_lack_of_uvs: string; // 参数: {mesh, primitive}
      empty_morph: string; // 参数: {mesh, primitive}
      unsupported_extension: string; // 参数: {name}
      failed_to_load_image: string; // 参数: {url, reason}
      image_uri_should_be_file_url: string;
      failed_to_convert_tga: string;
    };
    fbx: {
      failed_to_convert_fbx_file: string; // 参数: {path}
      no_available_fbx_temp_dir: string;
      fbx2glTF_exists_with_non_zero_code: string; // 参数: {code, output}
      fbxGlTfConv: {
        badCPU: string;
        missing_dll: string;
        unsupported_inherit_type: string; // 参数: {type, nodes}
        multi_material_layers: string; // 参数: {mesh}
        skin_merge_error: string; // 参数: {node}
      };
    };
    dragonbones_atlas: {
      texture_not_imported: string; // 参数: {texture}
      texture_not_found: string; // 参数: {atlas, texture}
    };
    script: {
      invalidClassName: string;
      findClassNameFromFileNameFailed: string; // 参数: {fileBasename, className}
      transform_failure: string; // 参数: {path, reason}
    };
    texture: {
      anisotropy: string;
      anisotropyTip: string;
      filterMode: string;
      filterModeTip: string;
      minfilter: string;
      minfilterTip: string;
      magfilter: string;
      magfilterTip: string;
      generateMipmaps: string;
      generateMipmapsTip: string;
      mipfilter: string;
      mipfilterTip: string;
      wrapMode: string;
      wrapModeTip: string;
      wrapModeS: string;
      wrapModeSTip: string;
      wrapModeT: string;
      wrapModeTTip: string;
      modeWarn: string;
      filterDiffenent: string; // 参数: {atlasFile}
    };
  };
}

// 扁平化的键类型
export type I18nKeys = 'assets.title' | 'assets.description' | 'assets.deprecatedTip' | 'assets.globalReadonlyTip' | 'assets.debug-mode' | 'assets.assetDBPauseTips' | 'assets.assetDBInitError' | 'assets.saveAsset.fail.unknown' | 'assets.saveAsset.fail.uuid' | 'assets.saveAsset.fail.asset' | 'assets.saveAsset.fail.content' | 'assets.saveAsset.fail.readonly' | 'assets.saveAssetMeta.fail.unknown' | 'assets.saveAssetMeta.fail.uuid' | 'assets.saveAssetMeta.fail.content' | 'assets.saveAssetMeta.fail.readonly' | 'assets.init.noAssetDBList' | 'assets.operation.invalid_url' | 'assets.operation.exists_url' | 'assets.operation.readonly' | 'assets.operation.overwrite' | 'assets.deleteAsset.fail.unknown' | 'assets.deleteAsset.fail.url' | 'assets.deleteAsset.fail.unexist' | 'assets.deleteAsset.fail.readonly' | 'assets.createAsset.title' | 'assets.createAsset.fail.unknown' | 'assets.createAsset.fail.type' | 'assets.createAsset.fail.url' | 'assets.createAsset.fail.exist' | 'assets.createAsset.fail.drop' | 'assets.createAsset.fail.toUrl' | 'assets.createAsset.fail.uuid' | 'assets.importAsset.metaExists' | 'assets.openAsset.preferenceProgramWarning' | 'assets.openAsset.fail.noAsset' | 'assets.copyAsset.fail.unknown' | 'assets.copyAsset.fail.url' | 'assets.restoreAssetDBFromCacheInValid.upgrade' | 'assets.restoreAssetDBFromCacheInValid.noLibraryPath' | 'assets.preferences.log_level' | 'assets.preferences.log_level_debug' | 'assets.preferences.log_level_log' | 'assets.preferences.log_level_warn' | 'assets.preferences.log_level_error' | 'assets.preferences.ignore_glob' | 'assets.preferences.ignore_changed' | 'builder.title' | 'builder.description' | 'builder.create_user_template' | 'builder.build_config' | 'builder.build' | 'builder.compile' | 'builder.open_log_file' | 'builder.generate_engine' | 'builder.require' | 'builder.new_build_task' | 'builder.empty_task_holder' | 'builder.empty_scene' | 'builder.empty_platforms' | 'builder.reveal_in_explorer' | 'builder.view_build_config' | 'builder.recompile' | 'builder.confirm' | 'builder.use_splash_screen' | 'builder.bundleCommonChunk' | 'builder.bundleCommonChunkTips' | 'builder.tips.enter_name' | 'builder.tips.taskName' | 'builder.tips.build_path' | 'builder.tips.build_scenes' | 'builder.tips.set_start_scene' | 'builder.tips.atlas_in_resources' | 'builder.tips.use_texture_in_atlas' | 'builder.tips.use_image_in_atlas' | 'builder.tips.task_exist' | 'builder.tips.task_busy' | 'builder.tips.platform_missing' | 'builder.tips.conflict_platform' | 'builder.tips.waiting_for_remove_task' | 'builder.tips.waiting_for_db_ready' | 'builder.tips.waiting_for_plugin_ready' | 'builder.tips.waiting_for_worker_ready' | 'builder.tips.waiting_for_data_ready' | 'builder.tips.scene_in_bundle' | 'builder.tips.create_application_template_success' | 'builder.tips.create_application_template_overwrite' | 'builder.tips.applicationEjsVersion' | 'builder.tips.setSplashSetting' | 'builder.tips.buildTaskCanceled' | 'builder.tips.pauseAssetImport' | 'builder.tips.disablePlatform' | 'builder.tips.disablePlatformForBuildCommand' | 'builder.tips.disableRegisterPlatformInfo' | 'builder.tips.platformInformationInvalid' | 'builder.tips.createTemplateSuccess' | 'builder.tips.templateVersionWarning' | 'builder.tips.buildPackageMissing' | 'builder.error.build_error' | 'builder.error.build_dir_not_exists' | 'builder.error.build_path_contains_space' | 'builder.error.buildPathContainsChineseAndSymbol' | 'builder.error.can_not_empty' | 'builder.error.project_name_not_legal' | 'builder.error.package_name_not_legal' | 'builder.error.package_name_start_with_number' | 'builder.error.select_scenes_to_build' | 'builder.error.path_too_long_title' | 'builder.error.path_too_long_desc' | 'builder.error.keep_raw_texture_of_atlas' | 'builder.error.run_hooks_failed' | 'builder.error.cache_compress_texture_missing' | 'builder.error.deserialize_failed' | 'builder.error.missing_import_files' | 'builder.error.required_asset_missing' | 'builder.error.missing_asset' | 'builder.error.check_options_failed' | 'builder.error.unknown_platform' | 'builder.error.asset_import_failed' | 'builder.error.get_asset_json_failed' | 'builder.error.builder_crash' | 'builder.error.texture_compress_failed' | 'builder.error.missingSplashTips' | 'builder.error.invalidStartScene' | 'builder.error.missingScenes' | 'builder.error.bundleConfigs' | 'builder.error.platformRegisterError' | 'builder.error.checkFailed' | 'builder.error.engineModulesConfigKeyMissing' | 'builder.warn.no_defined_in_i18n' | 'builder.warn.no_serialized_json' | 'builder.warn.same_load_url' | 'builder.warn.atlas_in_resources' | 'builder.warn.path_not_exist' | 'builder.warn.http' | 'builder.warn.required' | 'builder.warn.no_chinese' | 'builder.warn.checkFailedWithNewValue' | 'builder.warn.compress_rgb_a' | 'builder.warn.assetBundleIsRemoteInvalid' | 'builder.warn.requireMipmaps' | 'builder.warn.invalidCustomSplash' | 'builder.warn.invalidRemoveSplash' | 'builder.warn.exceptionRemoveSplash' | 'builder.warn.deprecatedTip' | 'builder.warn.resourcesRemoteLockWaring' | 'builder.warn.repeatAtlasInBundle' | 'builder.warn.engineModulesFallBackTip' | 'builder.warn.invalidOptionInSeparateEngine' | 'builder.warn.separateEngineWithCustomEngine' | 'builder.warn.invalidVersionInSeparateEngine' | 'builder.tasks.build_asset' | 'builder.tasks.build_engine' | 'builder.tasks.build_img' | 'builder.tasks.build_json' | 'builder.tasks.build_atlas' | 'builder.tasks.build_script' | 'builder.tasks.build_project_script' | 'builder.tasks.build_suffix' | 'builder.tasks.build_template' | 'builder.tasks.build_zip_bundle' | 'builder.tasks.load_script' | 'builder.tasks.sort_asset' | 'builder.tasks.build_import_map' | 'builder.tasks.sort_import_map' | 'builder.tasks.sort_asset_bundle' | 'builder.tasks.sort_image' | 'builder.tasks.sort_script' | 'builder.tasks.sort_sprite_frame' | 'builder.tasks.sort_texture' | 'builder.tasks.sort_json' | 'builder.tasks.settings.cache' | 'builder.tasks.settings.options' | 'builder.tasks.settings.design_resolution' | 'builder.tasks.settings.group' | 'builder.tasks.settings.md5' | 'builder.tasks.settings.scene' | 'builder.tasks.settings.script' | 'builder.tasks.settings.init' | 'builder.tasks.settings.macro' | 'builder.tasks.postprocess.compress' | 'builder.tasks.postprocess.save_config' | 'builder.tasks.postprocess.save_settings' | 'builder.asset_bundle.is_bundle' | 'builder.asset_bundle.bundle_name' | 'builder.asset_bundle.priority' | 'builder.asset_bundle.priority_tooltip' | 'builder.asset_bundle.compression_type' | 'builder.asset_bundle.compression_type_tooltip' | 'builder.asset_bundle.target_platform' | 'builder.asset_bundle.target_platform_tooltip' | 'builder.asset_bundle.is_remote_bundle' | 'builder.asset_bundle.remote_bundle_invalid_tooltip' | 'builder.asset_bundle.none' | 'builder.asset_bundle.none_tooltip' | 'builder.asset_bundle.subpackage' | 'builder.asset_bundle.subpackage_tooltip' | 'builder.asset_bundle.merge_dep' | 'builder.asset_bundle.merge_dep_tooltip' | 'builder.asset_bundle.merge_all_json' | 'builder.asset_bundle.merge_all_json_tooltip' | 'builder.asset_bundle.zip' | 'builder.asset_bundle.zip_tooltip' | 'builder.asset_bundle.duplicate_name_message' | 'builder.asset_bundle.duplicate_name_messaged_auto_rename' | 'builder.asset_bundle.duplicate_reserved_keyword_message' | 'builder.asset_bundle.nest_bundle' | 'builder.asset_bundle.filterConfig.title' | 'builder.asset_bundle.filterConfig.add' | 'builder.asset_bundle.filterConfig.preview' | 'builder.asset_bundle.filterConfig.addAsset' | 'builder.asset_bundle.filterConfig.include' | 'builder.asset_bundle.filterConfig.exclude' | 'builder.asset_bundle.filterConfig.asset' | 'builder.asset_bundle.filterConfig.url' | 'builder.asset_bundle.filterConfig.glob' | 'builder.asset_bundle.filterConfig.globTips' | 'builder.asset_bundle.filterConfig.beginWith' | 'builder.asset_bundle.filterConfig.endWith' | 'builder.asset_bundle.filterConfig.contain' | 'builder.asset_bundle.filterConfig.emptyConfig' | 'builder.asset_bundle.filterConfig.previewList' | 'builder.asset_bundle.filterConfig.previewTips' | 'builder.asset_bundle.filterConfig.emptyPreviewList' | 'builder.asset_bundle.emptyBundle' | 'builder.asset_bundle.bundleBuildTips' | 'builder.asset_bundle.bundleBuildPlatformTips' | 'builder.asset_bundle.buildBundle' | 'builder.asset_bundle.publishConfig' | 'builder.asset_bundle.buildBundleINProcess' | 'builder.asset_bundle.bundleBuildCloseTip' | 'builder.asset_bundle.buildBundleBusy' | 'builder.asset_bundle.buildBundleParams' | 'builder.asset_bundle.bundleConfig' | 'builder.asset_bundle.exportBundleBuildConfig' | 'builder.asset_bundle.preferredOptions' | 'builder.asset_bundle.preferredOptionsTips' | 'builder.asset_bundle.fallbackOptions' | 'builder.asset_bundle.fallbackOptionsTips' | 'builder.asset_bundle.platformOverride' | 'builder.asset_bundle.platformOverrideEmptyTip' | 'builder.asset_bundle.defaultConfig' | 'builder.asset_bundle.native' | 'builder.asset_bundle.web' | 'builder.asset_bundle.minigame' | 'builder.asset_bundle.importConfig' | 'builder.asset_bundle.exportConfig' | 'builder.asset_bundle.previewSetting' | 'builder.asset_bundle.platform' | 'builder.asset_bundle.platformConfig' | 'builder.asset_bundle.editConfig' | 'builder.asset_bundle.addConfig' | 'builder.asset_bundle.deleteConfig' | 'builder.asset_bundle.targetPlatform' | 'builder.asset_bundle.isRemoteFallbackTips' | 'builder.asset_bundle.reset' | 'builder.asset_bundle.resetUni' | 'builder.asset_bundle.separateConfig' | 'builder.asset_bundle.allMiniGames' | 'builder.asset_bundle.uniConfig' | 'builder.asset_bundle.true' | 'builder.asset_bundle.false' | 'builder.asset_bundle.overwrite' | 'builder.asset_bundle.merge' | 'builder.project.texture_compress.title' | 'builder.project.texture_compress.compress_preset' | 'builder.project.texture_compress.custom_format' | 'builder.project.texture_compress.same_config_name' | 'builder.project.texture_compress.addConfig' | 'builder.project.texture_compress.editConfigName' | 'builder.project.texture_compress.export_config' | 'builder.project.texture_compress.import_config' | 'builder.project.texture_compress.import_config_options' | 'builder.project.texture_compress.merge' | 'builder.project.texture_compress.presetName' | 'builder.project.texture_compress.addFormat' | 'builder.project.texture_compress.compressFormat' | 'builder.project.texture_compress.mipmap.noPowerOfTwo' | 'builder.project.texture_compress.tips.require_object' | 'builder.project.texture_compress.tips.require_name' | 'builder.project.texture_compress.tips.xx_require_object' | 'builder.project.texture_compress.tips.platform_err' | 'builder.project.texture_compress.tips.texture_type_err' | 'builder.project.texture_compress.tips.options_quality_type_err' | 'builder.project.texture_compress.tips.number_quality_type_err' | 'builder.project.texture_compress.tips.import_failed' | 'builder.project.texture_compress.tips.user_preset_err' | 'builder.project.texture_compress.tips.enter_config_name_to_add' | 'builder.project.texture_compress.tips.input_config_name_to_search' | 'builder.project.splashSetting.title' | 'builder.project.splashSetting.confirm' | 'builder.project.splashSetting.settings.totalTime' | 'builder.project.splashSetting.settings.displayRatio' | 'builder.project.splashSetting.settings.autoFit' | 'builder.project.splashSetting.settings.watermarkLocation' | 'builder.project.splashSetting.settings.logo.title' | 'builder.project.splashSetting.settings.logo.default' | 'builder.project.splashSetting.settings.logo.none' | 'builder.project.splashSetting.settings.logo.custom' | 'builder.project.splashSetting.settings.background.title' | 'builder.project.splashSetting.settings.background.default' | 'builder.project.splashSetting.settings.background.color' | 'builder.project.splashSetting.settings.background.custom' | 'builder.project.splashSetting.settings.background.customTips' | 'builder.project.splashSetting.custom' | 'builder.project.splashSetting.default' | 'builder.project.splashSetting.disabled' | 'builder.project.splashSetting.watermarkLocationConfig.top' | 'builder.project.splashSetting.watermarkLocationConfig.bottom' | 'builder.project.splashSetting.watermarkLocationConfig.left' | 'builder.project.splashSetting.watermarkLocationConfig.right' | 'builder.project.splashSetting.watermarkLocationConfig.center' | 'builder.project.splashSetting.preview' | 'builder.project.splashSetting.totalTimeTips' | 'builder.project.splashSetting.displayRatioTips' | 'builder.project.splashSetting.tips' | 'builder.project.splashSetting.selectImage' | 'builder.project.splashSetting.useDefaultTip' | 'builder.project.splashSetting.enableCustomSplash' | 'builder.project.splashSetting.reset' | 'builder.project.splashSetting.previewInBrowser' | 'builder.project.splashSetting.informationDialogUnusual' | 'builder.example' | 'builder.platforms.native.title' | 'builder.platforms.native.encrypt.disable_tips' | 'builder.platforms.mac.title' | 'builder.platforms.mac.error.m1_with_physic_x' | 'common.loading' | 'common.success' | 'common.error' | 'common.warning' | 'common.info' | 'common.confirm' | 'common.cancel' | 'common.ok' | 'common.yes' | 'common.no' | 'common.save' | 'common.delete' | 'common.edit' | 'common.create' | 'common.update' | 'common.refresh' | 'common.close' | 'common.open' | 'common.back' | 'common.next' | 'common.previous' | 'common.finish' | 'common.start' | 'common.stop' | 'common.pause' | 'common.resume' | 'common.deprecatedTip' | 'importer.invalidNodeData' | 'importer.node' | 'importer.component' | 'importer.sharpError' | 'importer.glTF.glTF_asset_group_mesh' | 'importer.glTF.glTF_asset_group_animation' | 'importer.glTF.glTF_asset_group_node' | 'importer.glTF.glTF_asset_group_skin' | 'importer.glTF.glTF_asset_group_sampler' | 'importer.glTF.glTF_asset' | 'importer.glTF.glTF_asset_no_name' | 'importer.glTF.unsupported_alpha_mode' | 'importer.glTF.unsupported_texture_parameter' | 'importer.glTF.texture_parameter_min_filter' | 'importer.glTF.texture_parameter_mag_filter' | 'importer.glTF.unsupported_channel_path' | 'importer.glTF.reference_skin_in_different_scene' | 'importer.glTF.disallow_cubic_spline_channel_split' | 'importer.glTF.failed_to_calculate_tangents_due_to_lack_of_normals' | 'importer.glTF.failed_to_calculate_tangents_due_to_lack_of_uvs' | 'importer.glTF.empty_morph' | 'importer.glTF.unsupported_extension' | 'importer.glTF.failed_to_load_image' | 'importer.glTF.image_uri_should_be_file_url' | 'importer.glTF.failed_to_convert_tga' | 'importer.fbx.failed_to_convert_fbx_file' | 'importer.fbx.no_available_fbx_temp_dir' | 'importer.fbx.fbx2glTF_exists_with_non_zero_code' | 'importer.fbx.fbxGlTfConv.badCPU' | 'importer.fbx.fbxGlTfConv.missing_dll' | 'importer.fbx.fbxGlTfConv.unsupported_inherit_type' | 'importer.fbx.fbxGlTfConv.multi_material_layers' | 'importer.fbx.fbxGlTfConv.skin_merge_error' | 'importer.dragonbones_atlas.texture_not_imported' | 'importer.dragonbones_atlas.texture_not_found' | 'importer.script.invalidClassName' | 'importer.script.findClassNameFromFileNameFailed' | 'importer.script.transform_failure' | 'importer.texture.anisotropy' | 'importer.texture.anisotropyTip' | 'importer.texture.filterMode' | 'importer.texture.filterModeTip' | 'importer.texture.minfilter' | 'importer.texture.minfilterTip' | 'importer.texture.magfilter' | 'importer.texture.magfilterTip' | 'importer.texture.generateMipmaps' | 'importer.texture.generateMipmapsTip' | 'importer.texture.mipfilter' | 'importer.texture.mipfilterTip' | 'importer.texture.wrapMode' | 'importer.texture.wrapModeTip' | 'importer.texture.wrapModeS' | 'importer.texture.wrapModeSTip' | 'importer.texture.wrapModeT' | 'importer.texture.wrapModeTTip' | 'importer.texture.modeWarn' | 'importer.texture.filterDiffenent';

// 为 i18next 提供的类型扩展
declare module 'i18next' {
  interface TFunction {
    (key: I18nKeys, options?: any): string;
  }
}

// 为 i18n 实例提供的类型扩展
declare module 'i18next' {
  interface i18n {
    t: TFunction;
  }
}

// 导出 i18n 实例类型
export interface I18nInstance {
  t: (key: I18nKeys, options?: any) => string;
}

// 工具类型：提取插值参数
export type ExtractParams<T extends string> = T extends `${string}{${infer P}}${string}`
  ? P | ExtractParams<T extends `${string}{${P}}${infer Rest}` ? Rest : never>
  : never;

// 工具类型：获取键对应的参数类型
export type GetKeyParams<K extends I18nKeys> = K extends keyof I18nResources
  ? ExtractParams<I18nResources[K]>
  : never;
