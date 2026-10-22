package models

import (
	"database/sql/driver"
	"errors"
)

type QueueName string

const (
	QuickScanQueue     QueueName = "quick_scan"
	SystemCleanUpQueue QueueName = "system_clean_up"
)

func (name *QueueName) Scan(value string) error {
	*name = QueueName(value)
	return nil
}

func (name QueueName) Value() (driver.Value, error) {
	if name != QuickScanQueue &&
		name != SystemCleanUpQueue {
		return nil, errors.New("invalid queue name")
	}

	return string(name), nil
}

func GetQueueNames() []QueueName {
	return []QueueName{
		QuickScanQueue,
		SystemCleanUpQueue,
	}
}

func GetDefaultQueueConfigurationMap() map[QueueName]TaskQueueConfiguration {
	return map[QueueName]TaskQueueConfiguration{
		QuickScanQueue:     GetDefaultQuickScanQueueConfiguration(),
		SystemCleanUpQueue: GetDefaultSystemCleanupQueueConfiguration(),
	}
}
