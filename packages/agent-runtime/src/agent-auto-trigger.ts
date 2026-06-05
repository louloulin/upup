/**
 * Agent Auto-Trigger Integration
 * 
 * Integrates the Intent Detector and Skill Trigger system into the main agent loop.
 * This provides investment-specific intelligence for the agent.
 */

import { info, warn, debug } from '@upup/utils/logging';
import { getAutoTriggerIntegration, type AutoTriggerResult } from './auto-trigger.js';
import type { Intent } from '@upup/skills/intent-detector';

/**
 * Agent integration interface for Auto-Trigger
 */
export interface AgentAutoTriggerIntegration {
  /** Initialize at the start of agent run */
  onQueryStart(query: string): Promise<AutoTriggerResult>;
  
  /** Clean up at the end of agent run */
  onQueryEnd(query: string, result: AutoTriggerResult, duration: number): Promise<void>;
  
  /** Get the last trigger result */
  getLastResult(): AutoTriggerResult | null;
  
  /** Check if auto-trigger is enabled */
  isEnabled(): boolean;
}

/**
 * Create Agent Auto-Trigger integration
 */
export function createAgentAutoTriggerIntegration(): AgentAutoTriggerIntegration {
  let lastResult: AutoTriggerResult | null = null;
  let enabled = true;
  
  // Lazy initialization of auto-trigger
  let autoTrigger: ReturnType<typeof getAutoTriggerIntegration> | null = null;
  
  function getAutoTrigger() {
    if (!autoTrigger) {
      autoTrigger = getAutoTriggerIntegration({ 
        enabled: true,
        mode: 'suggest',
        showSuggestions: true,
      });
    }
    return autoTrigger;
  }
  
  return {
    async onQueryStart(query: string): Promise<AutoTriggerResult> {
      if (!enabled) {
        return {
          intents: [],
          triggers: [],
          suggestion: null,
          hasInvestmentIntent: false,
          tickers: [],
        };
      }
      
      try {
        const trigger = getAutoTrigger();
        const result = trigger.detectAndSuggest(query);
        lastResult = result;
        
        // Log detected intents
        if (result.intents.length > 0) {
          info('agent', `Detected ${result.intents.length} investment intents: ${result.intents.map(i => i.type).join(', ')}`);
        }
        
        // Log extracted tickers
        if (result.tickers.length > 0) {
          info('agent', `Extracted investment tickers: ${result.tickers.join(', ')}`);
        }
        
        // Log triggered skills
        if (result.triggers.length > 0) {
          const triggeredSkills = result.triggers.map(t => `${t.skill}(${t.status})`).join(', ');
          info('agent', `Triggered skills: ${triggeredSkills}`);
        }
        
        return result;
      } catch (err) {
        warn('agent', `Auto-trigger detection failed: ${err}`);
        return {
          intents: [],
          triggers: [],
          suggestion: null,
          hasInvestmentIntent: false,
          tickers: [],
        };
      }
    },
    
    async onQueryEnd(query: string, result: AutoTriggerResult, duration: number): Promise<void> {
      if (!enabled || result.tickers.length === 0) {
        return;
      }
      
      try {
        const trigger = getAutoTrigger();
        await trigger.executePostResearch(query, result.tickers, [], duration);
      } catch (err) {
        warn('agent', `Post-research hook failed: ${err}`);
      }
    },
    
    getLastResult(): AutoTriggerResult | null {
      return lastResult;
    },
    
    isEnabled(): boolean {
      return enabled;
    },
  };
}

// Singleton instance
let globalIntegration: AgentAutoTriggerIntegration | null = null;

export function getAgentAutoTriggerIntegration(): AgentAutoTriggerIntegration {
  if (!globalIntegration) {
    globalIntegration = createAgentAutoTriggerIntegration();
  }
  return globalIntegration;
}

export function resetAgentAutoTriggerIntegration(): void {
  globalIntegration = null;
}

/**
 * Format skill suggestions for display
 */
export function formatSkillSuggestionsForDisplay(result: AutoTriggerResult): string {
  if (!result.suggestion && result.triggers.length === 0) {
    return '';
  }
  
  const lines: string[] = [];
  
  lines.push('\n┌─────────────────────────────────────────────────────────────────┐');
  lines.push('│                    💡 投资技能建议                                   │');
  lines.push('├─────────────────────────────────────────────────────────────────┤');
  
  // Show extracted tickers
  if (result.tickers.length > 0) {
    lines.push(`│ 📈 股票代码: ${result.tickers.join(', ').padEnd(42)} │`);
  }
  
  // Show intents
  if (result.intents.length > 0) {
    const intentStr = result.intents.map(i => i.type).join(', ');
    lines.push(`│ 🎯 投资意图: ${intentStr.substring(0, 44).padEnd(44)} │`);
  }
  
  // Show triggered skills
  if (result.triggers.length > 0) {
    lines.push('│─────────────────────────────────────────────────────────────────│');
    lines.push('│ 📋 推荐技能:                                                   │');
    for (const trigger of result.triggers.slice(0, 5)) {
      const icon = trigger.status === 'triggered' ? '🚀' : '💡';
      const skillLine = `${icon} /${trigger.skill}`.substring(0, 50);
      lines.push(`│   ${skillLine.padEnd(55)} │`);
    }
  }
  
  lines.push('└─────────────────────────────────────────────────────────────────┘');
  
  return lines.join('\n');
}
