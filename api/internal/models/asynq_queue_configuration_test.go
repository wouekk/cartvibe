package models

import (
	"cartvibe/api/internal/utils"
	"testing"
)

func assertQueueConfiguration(t *testing.T, config TaskQueueConfiguration, name QueueName, priority int) {
	t.Run(string(name), func(t *testing.T) {
		if config.Name != name {
			utils.PrintTestError(t, config.Name, name)
		}
		if config.Priority != priority {
			utils.PrintTestError(t, config.Priority, priority)
		}
	})
}

func TestGetDefaultQuickScanQueueConfiguration(t *testing.T) {
	assertQueueConfiguration(t, GetDefaultQuickScanQueueConfiguration(), QuickScanQueue, 4)
}

func TestGetDefaultSystemCleanupQueueConfiguration(t *testing.T) {
	assertQueueConfiguration(t, GetDefaultSystemCleanupQueueConfiguration(), SystemCleanUpQueue, 5)
}

func TestGetAllDefaultQueueConfigurations(t *testing.T) {
	configs := GetAllDefaultQueueConfigurations()

	expected := []TaskQueueConfiguration{
		GetDefaultQuickScanQueueConfiguration(),
		GetDefaultSystemCleanupQueueConfiguration(),
	}
	if len(configs) != len(expected) {
		utils.PrintTestError(t, len(configs), len(expected))
	}

	for i, v := range expected {
		assertQueueConfiguration(t, configs[i], v.Name, v.Priority)
	}
}
