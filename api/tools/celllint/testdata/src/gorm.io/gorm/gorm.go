package gorm

type DB struct{}

type Config struct{}

type Dialector interface{}

func Open(dialector Dialector, config *Config) (*DB, error) { return &DB{}, nil }
