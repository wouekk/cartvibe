package jobs

import (
	"time"

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

// sweepRunLimit bounds one run of a frequent sweep: it may take at most this long, and no second copy is
// queued while one waits or runs, so a hung AI provider cannot pile up a task every 30 seconds. It matches the
// 30-minute lease a sweep holds on the rows it claims (claimDue).
const sweepRunLimit = 30 * time.Minute

// sweepOptions are the extra options a frequent sweep is scheduled with.
func sweepOptions() []asynq.Option {
	return []asynq.Option{asynq.Unique(sweepRunLimit), asynq.Timeout(sweepRunLimit)}
}

func EnqueueTask(task *asynq.Task, queue models.QueueName) (*asynq.TaskInfo, error) {
	client := repositories.GetAsynqClient()
	return client.Enqueue(task, enqueueOptions(queue)...)
}

func RegisterTask(cronspec string, task *asynq.Task, queue models.QueueName, maxRetry int, extra ...asynq.Option) (string, error) {
	return scheduler.Register(cronspec, task, registerOptions(queue, maxRetry, extra...)...)
}

func registerOptions(queue models.QueueName, maxRetry int, extra ...asynq.Option) []asynq.Option {
	return append([]asynq.Option{asynq.MaxRetry(maxRetry), asynq.Queue(string(queue))}, extra...)
}
