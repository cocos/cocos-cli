import { BuildExitCode } from "./@types/private";

const BuildErrorMap = {
    [BuildExitCode.BUILD_BUSY]: '其他构建正在运行中，请稍后再试',
    [BuildExitCode.BUILD_FAILED]: '构建失败，请参考错误日志排查错误原因',
    [BuildExitCode.PARAM_ERROR]: '构建参数错误，请参考错误日志调整构建参数后重试',
    [BuildExitCode.UNKNOWN_ERROR]: '未知错误，请联系 cocos 官方',
}

export default BuildErrorMap;