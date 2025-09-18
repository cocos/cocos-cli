import z from "zod";
import { Tool, Title, Description, Param, Result } from "./decorator";

// ===== 使用修改后的 Result 装饰器的示例 =====

// 定义一些数据 schema
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
});

const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  createdAt: z.string().datetime(),
});

const StatsSchema = z.object({
  totalProjects: z.number(),
  totalUsers: z.number(),
  lastActivity: z.string().datetime(),
});

// 示例工具类
export class ApiTools {
  
  // 示例 1: 返回用户信息
  @Tool("get-user")
  @Title("获取用户信息")
  @Description("根据用户ID获取用户详细信息")
  @Result(UserSchema)  // 现在会自动包装成 { code: number, data: UserSchema }
  async getUser(
    @Param(z.number()) userId: number
  ) {
    // 返回的数据会被验证为 CommonResult<UserSchema> 格式
    return {
      code: 200,
      data: {
        id: userId,
        name: "张三",
        email: "zhangsan@example.com"
      }
    };
  }

  // 示例 2: 返回项目列表
  @Tool("list-projects")
  @Title("获取项目列表")
  @Description("获取所有项目的列表")
  @Result(z.array(ProjectSchema))  // 数组类型也会被自动包装
  async listProjects() {
    return {
      code: 200,
      data: [
        {
          id: "proj-1",
          name: "项目1",
          description: "第一个项目",
          createdAt: "2024-01-01T00:00:00Z"
        },
        {
          id: "proj-2", 
          name: "项目2",
          createdAt: "2024-01-02T00:00:00Z"
        }
      ]
    };
  }

  // 示例 3: 返回简单的字符串
  @Tool("get-version")
  @Title("获取版本号")
  @Description("获取当前系统版本号")
  @Result(z.string())  // 字符串类型会被包装成 { code: number, data: string }
  async getVersion() {
    return {
      code: 200,
      data: "1.0.0"
    };
  }

  // 示例 4: 返回布尔值
  @Tool("check-status")
  @Title("检查系统状态")
  @Description("检查系统是否正常运行")
  @Result(z.boolean())  // 布尔类型会被包装成 { code: number, data: boolean }
  async checkStatus() {
    return {
      code: 200,
      data: true
    };
  }

  // 示例 5: 返回统计数据
  @Tool("get-stats")
  @Title("获取统计数据")
  @Description("获取系统统计信息")
  @Result(StatsSchema)  // 复杂对象会被包装成 { code: number, data: StatsSchema }
  async getStats() {
    return {
      code: 200,
      data: {
        totalProjects: 10,
        totalUsers: 25,
        lastActivity: "2024-01-15T10:30:00Z"
      }
    };
  }

  // 示例 6: 返回数字
  @Tool("count-items")
  @Title("计算项目数量")
  @Description("计算指定类型的项目数量")
  @Result(z.number())  // 数字类型会被包装成 { code: number, data: number }
  async countItems(
    @Param(z.string()) itemType: string
  ) {
    return {
      code: 200,
      data: 42
    };
  }

  // 示例 7: 返回可选数据
  @Tool("find-project")
  @Title("查找项目")
  @Description("根据名称查找项目，可能找不到")
  @Result(ProjectSchema.optional())  // 可选类型会被包装成 { code: number, data: ProjectSchema | undefined }
  async findProject(
    @Param(z.string()) projectName: string
  ) {
    if (projectName === "存在的项目") {
      return {
        code: 200,
        data: {
          id: "proj-found",
          name: projectName,
          createdAt: "2024-01-01T00:00:00Z"
        }
      };
    } else {
      return {
        code: 404,
        data: undefined
      };
    }
  }
}

// ===== 类型推导示例 =====

// 现在你可以这样推导类型：
type GetUserResult = {
  code: number;
  data: {
    id: number;
    name: string;
    email: string;
  };
};

type ListProjectsResult = {
  code: number;
  data: Array<{
    id: string;
    name: string;
    description?: string;
    createdAt: string;
  }>;
};

type GetVersionResult = {
  code: number;
  data: string;
};

// ===== 使用说明 =====

/*
修改后的 Result 装饰器的优势：

1. **自动包装**: 你只需要定义 data 部分的 schema，装饰器会自动包装成 CommonResult 格式
2. **类型安全**: 返回值会被自动验证为正确的格式
3. **简化使用**: 不需要手动创建 CommonResult schema
4. **统一格式**: 所有 API 都遵循相同的返回格式

使用方式：
- @Result(z.string()) → { code: number, data: string }
- @Result(z.number()) → { code: number, data: number }
- @Result(z.boolean()) → { code: number, data: boolean }
- @Result(UserSchema) → { code: number, data: UserSchema }
- @Result(z.array(ProjectSchema)) → { code: number, data: ProjectSchema[] }

这样你就可以专注于定义 data 部分的结构，而不用担心整体的响应格式。
*/