/**
 * Stock Analysis Workflow - 多智能体股票分析工作流
 * 
 * 基于Claude Code Swarm设计的多智能体股票分析流程:
 * - 研究员Agent: 调研公司基本面
 * - 分析师Agent: 分析财务指标
 * - 汇总Agent: 生成投资建议
 * 
 * 工作流通过coordinator协调多个Agent完成任务
 */

import { getSwarmCoordinator } from '../coordinator.js';
import { getTeamManager } from '../team-manager.js';

export interface StockAnalysisInput {
  /** 股票代码，如 '000001.SZ' 或 '600519.SH' */
  symbol: string;
  /** 股票名称 */
  name: string;
  /** 分析深度: basic (基本面), detailed (详细), comprehensive (全面) */
  depth?: 'basic' | 'detailed' | 'comprehensive';
}

export interface StockAnalysisResult {
  /** 股票代码 */
  symbol: string;
  /** 股票名称 */
  name: string;
  /** 分析团队 */
  team: string;
  /** 研究员报告 */
  researcherReport?: string;
  /** 分析师报告 */
  analystReport?: string;
  /** 最终投资建议 */
  recommendation?: string;
  /** 风险提示 */
  risks?: string[];
  /** 完成时间 */
  completedAt: number;
  /** 成功状态 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

export interface AgentReport {
  agentId: string;
  agentName: string;
  role: string;
  status: string;
  findings: string[];
  result?: string;
}

/**
 * 执行多智能体股票分析
 */
export async function runStockAnalysis(
  input: StockAnalysisInput
): Promise<StockAnalysisResult> {
  const { symbol, name, depth = 'basic' } = input;
  const teamName = `stock-analysis-${symbol}`;
  
  const result: StockAnalysisResult = {
    symbol,
    name,
    team: teamName,
    completedAt: Date.now(),
    success: false,
  };

  try {
    const coordinator = getSwarmCoordinator();
    const teamManager = getTeamManager();
    
    // Initialize
    await coordinator.initialize();
    await teamManager.initialize();

    // Clean up old teams for this symbol
    const existingTeam = teamManager.getTeam(teamName);
    if (existingTeam) {
      teamManager.deleteTeam(teamName);
    }

    // Create team
    const team = coordinator.createTeam(
      teamName,
      `股票分析团队: ${name} (${symbol})`,
      'coordinator'
    );

    console.log(`[StockAnalysis] Created team: ${teamName}`);

    // Step 1: Spawn 研究员Agent
    console.log(`[StockAnalysis] Spawning researcher agent...`);
    const researcher = await coordinator.spawnAgent({
      teamId: teamName,
      name: 'researcher',
      role: 'researcher',
      prompt: `你是股票研究员，分析 ${symbol} (${name}) 的基本面。
      
任务:
1. 调研公司概况和主营业务
2. 分析行业地位和竞争优势
3. 调研近期重大事件和新闻
4. 评估公司治理结构

请提供详细的基本面分析报告。`,
      tools: '*',
      maxTurns: depth === 'comprehensive' ? 15 : depth === 'detailed' ? 10 : 5,
    });

    // Step 2: Spawn 分析师Agent
    console.log(`[StockAnalysis] Spawning analyst agent...`);
    const analyst = await coordinator.spawnAgent({
      teamId: teamName,
      name: 'analyst',
      role: 'analyst',
      prompt: `你是股票分析师，分析 ${symbol} (${name}) 的财务指标。
      
任务:
1. 分析营收和利润趋势
2. 评估估值水平 (市盈率、市净率)
3. 分析盈利能力 (ROE、毛利率)
4. 评估现金流状况

请提供详细的财务分析报告。`,
      tools: '*',
      maxTurns: depth === 'comprehensive' ? 15 : depth === 'detailed' ? 10 : 5,
    });

    // Step 3: Spawn 汇总Agent
    console.log(`[StockAnalysis] Spawning summarizer agent...`);
    const summarizer = await coordinator.spawnAgent({
      teamId: teamName,
      name: 'summarizer',
      role: 'summarizer',
      prompt: `你是投资顾问，综合分析 ${symbol} (${name}) 的研究结果。
      
任务:
1. 综合研究员和分析师的报告
2. 生成投资建议 (买入/持有/卖出)
3. 提示潜在风险
4. 给出目标价位建议

请提供最终的投资建议报告。`,
      tools: '*',
      maxTurns: depth === 'comprehensive' ? 15 : depth === 'detailed' ? 10 : 5,
    });

    // Wait for agents to complete (simplified - in production would use proper async handling)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get results from all agents
    const agentResults = coordinator.getAgentResults(teamName);
    
    // Extract reports from results
    const researcherResult = agentResults.find(a => a.name === 'researcher');
    const analystResult = agentResults.find(a => a.name === 'analyst');
    const summarizerResult = agentResults.find(a => a.name === 'summarizer');

    result.researcherReport = researcherResult?.result || '未完成';
    result.analystReport = analystResult?.result || '未完成';
    result.recommendation = summarizerResult?.result || '未完成';
    
    result.success = true;
    result.completedAt = Date.now();

    console.log(`[StockAnalysis] Analysis completed for ${symbol}`);

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.completedAt = Date.now();
    
    console.error(`[StockAnalysis] Error: ${result.error}`);
    
    return result;
  }
}

/**
 * 创建股票分析Skill的工具
 */
export function createStockAnalysisTool() {
  const { DynamicStructuredTool } = require('@langchain/core/tools');
  const { z } = require('zod');

  return new DynamicStructuredTool({
    name: 'stock_analysis',
    description: `[SWARM] Run multi-agent stock analysis using a team of agents.
    
Use this to analyze a stock with multiple specialized agents:
- Researcher: analyzes company fundamentals
- Analyst: analyzes financial metrics
- Summarizer: generates investment recommendation

The workflow coordinates these agents to produce a comprehensive analysis.`,
    
    schema: z.object({
      symbol: z.string().describe('Stock symbol (e.g., 000001.SZ, 600519.SH)'),
      name: z.string().describe('Stock name (e.g., 平安银行, 贵州茅台)'),
      depth: z.enum(['basic', 'detailed', 'comprehensive']).optional()
        .describe('Analysis depth (default: basic)'),
    }),

    func: async ({ symbol, name, depth }: { symbol: string; name: string; depth?: string }): Promise<string> => {
      const result = await runStockAnalysis({ symbol, name, depth: depth as "basic" | "detailed" | "comprehensive" || "basic" });
      
      return JSON.stringify(result, null, 2);
    },
  });
}

// Export for use
export const stockAnalysisTool = createStockAnalysisTool();
