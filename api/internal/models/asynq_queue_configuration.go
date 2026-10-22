package models

type TaskQueueConfiguration struct {
	BaseModel
	Name             QueueName      `json:"name" gorm:"unique"`
	Priority         int            `json:"priority"`
	SystemSettings   SystemSettings `json:"-"`
	SystemSettingsId uint           `json:"systemSettingsId"`
}

func GetDefaultQuickScanQueueConfiguration() TaskQueueConfiguration {
	return TaskQueueConfiguration{
		Name:     QuickScanQueue,
		Priority: 4,
	}
}

func GetDefaultSystemCleanupQueueConfiguration() TaskQueueConfiguration {
	return TaskQueueConfiguration{
		Name:     SystemCleanUpQueue,
		Priority: 5,
	}
}

func GetAllDefaultQueueConfigurations() []TaskQueueConfiguration {
	return []TaskQueueConfiguration{
		GetDefaultQuickScanQueueConfiguration(),
		GetDefaultSystemCleanupQueueConfiguration(),
	}
}
