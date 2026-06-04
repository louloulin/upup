## ADDED Requirements

### Requirement: News Adapter
The system SHALL provide a news Adapter for fetching financial news from sources: CLS (财联社), Xinhua Finance. Output is normalized to {title, source, url, publishedAt, symbols[], sentiment}.

#### Scenario: Fetch today's news
- **WHEN** user requests today's news for 600519
- **THEN** Adapter fetches and returns normalized news list, deduplicated and filtered by symbol match

### Requirement: Research Report Adapter
The system SHALL provide a research report Adapter for: Eastmoney Choice, 慧博. Output is normalized to {title, broker, rating, targetPrice, summary, publishedAt, symbols[]}.

#### Scenario: Fetch latest reports
- **WHEN** user requests latest research reports for 600519
- **THEN** Adapter returns list of recent reports with rating distribution

### Requirement: Social Sentiment Adapter
The system SHALL provide a social sentiment Adapter for: Xueqiu (雪球), X (Twitter). Output is normalized to {source, content, author, timestamp, symbols[], sentimentScore}.

#### Scenario: Sentiment aggregation
- **WHEN** user requests sentiment for 600519
- **THEN** Adapter returns aggregated sentiment score (bullish/bearish/neutral) with recent post samples

### Requirement: Dragon-Tiger and Northbound Flow
The system SHALL provide a Dragon-Tiger List and Northbound capital flow Adapter. Output includes daily/weekly flow data, top stocks, sector breakdown.

#### Scenario: Today's Dragon-Tiger
- **WHEN** user requests today's 龙虎榜
- **THEN** Adapter returns today's list with buy/sell broker details
