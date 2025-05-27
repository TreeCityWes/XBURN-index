# Changelog

## [1.1.0] - Database Structure Overhaul

### Major Changes
- Completely restructured database to use separate tables per chain
- Added proper chain-specific statistics tables
- Fixed NFT positions and swap burn events indexing
- Added user statistics tracking per chain
- Added transaction timestamp tracking instead of index time

### Added
- Chain-specific statistics tables (`chain_[CHAIN_ID]_chain_stats`)
- User statistics tables (`chain_[CHAIN_ID]_user_stats`)
- Top burns, daily burns, and top users views
- New `show-stats` script to display chain statistics
- `rebuild.sh` script for easy database rebuilding
- Improved health monitoring system

### Fixed
- NFT positions not being indexed correctly
- Swap burn events not being tracked properly
- Use of indexing timestamp instead of transaction timestamp
- Missing data for analyzing user behavior and burn statistics
- Health monitoring system using single database instance

### Updated
- Schema structure to be more efficient and scalable
- Chain indexer to update statistics after processing events
- Database initialization to properly set up all tables
- Metabase configuration for better analytics
- Docker Compose setup to ensure proper initialization

## [1.0.0] - Initial Release

- Initial version of the XBurn Analytics Dashboard Backend 