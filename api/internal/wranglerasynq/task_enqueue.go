package wranglerasynq

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"

	"github.com/hibiken/asynq"
)

// enqueueOptions are the asynq options a task enqueued onto this queue carries.
//
// No queue retains its completed tasks: ReceiptService.QuickScan removes its own upload as the last step
// of a successful scan and is 1:1 task-to-file, so retention would only pin a payload naming a path that
// no longer exists.
func enqueueOptions(queue models.QueueName) []asynq.Option {
	return []asynq.Option{asynq.MaxRetry(3), asynq.Queue(string(queue))}
}

func EnqueueTask(task *asynq.Task, queue models.QueueName) (*asynq.TaskInfo, error) {
	client := repositories.GetAsynqClient()
	return client.Enqueue(task, enqueueOptions(queue)...)
}

func RegisterTask(cronspec string, task *asynq.Task, queue models.QueueName, maxRetry int) (string, error) {
	return scheduler.Register(cronspec, task, asynq.MaxRetry(maxRetry), asynq.Queue(string(queue)))
}
