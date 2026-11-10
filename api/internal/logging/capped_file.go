package logging

import (
	"os"
	"sync"
)

// cappedFile is an append-only file that never grows past maxBytes: the write that would pass it first moves the
// file aside as "<path>.1" (replacing an earlier one) and starts a new one. One generation is kept, so a reader that
// wants more than the new file holds finds the rest there.
type cappedFile struct {
	mutex    sync.Mutex
	path     string
	maxBytes int64
	file     *os.File
	size     int64
}

func newCappedFile(path string, maxBytes int64) (*cappedFile, error) {
	capped := &cappedFile{path: path, maxBytes: maxBytes}
	if err := capped.open(); err != nil {
		return nil, err
	}
	return capped, nil
}

func (capped *cappedFile) open() error {
	file, err := os.OpenFile(capped.path, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0644)
	if err != nil {
		capped.file = nil
		return err
	}
	info, err := file.Stat()
	if err != nil {
		file.Close()
		capped.file = nil
		return err
	}
	capped.file = file
	capped.size = info.Size()
	return nil
}

func (capped *cappedFile) Write(line []byte) (int, error) {
	capped.mutex.Lock()
	defer capped.mutex.Unlock()

	if capped.file != nil && capped.size > 0 && capped.size+int64(len(line)) > capped.maxBytes {
		capped.rotate()
	}
	if capped.file == nil {
		// An earlier open failed (a full disk, a folder that went away): try again rather than stay silent for good.
		if err := capped.open(); err != nil {
			return 0, err
		}
	}

	written, err := capped.file.Write(line)
	capped.size += int64(written)
	return written, err
}

// rotate moves the full file aside and starts a new one. A rename the folder refuses leaves the full file in
// place, and the log carries on in it: a log over its cap is better than no log.
func (capped *cappedFile) rotate() {
	if err := capped.file.Close(); err != nil {
		return
	}
	previous := capped.path + ".1"
	// Windows refuses a rename onto an existing file.
	os.Remove(previous)
	os.Rename(capped.path, previous)
	capped.open()
}

func (capped *cappedFile) Close() error {
	capped.mutex.Lock()
	defer capped.mutex.Unlock()

	if capped.file == nil {
		return nil
	}
	err := capped.file.Close()
	capped.file = nil
	return err
}
