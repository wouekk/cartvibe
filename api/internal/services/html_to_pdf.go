package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
	"gorm.io/gorm"
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/env"
	"receipt-wrangler/api/internal/logging"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
)

const htmlToPdfTimeout = 30 * time.Second

type HtmlToPdfService struct {
	BaseService
}

func NewHtmlToPdfService(tx *gorm.DB) HtmlToPdfService {
	return HtmlToPdfService{
		BaseService: BaseService{
			DB: repositories.GetDB(),
			TX: tx,
		},
	}
}

// Render converts the given HTML to a PDF using a fresh headless Chromium
// process. External resources are allowed to load (subject to the overall
// timeout) so logos and product imagery embedded in receipt emails appear in
// the rendered output.
func (service HtmlToPdfService) Render(html string) ([]byte, commands.UpsertSystemTaskCommand, error) {
	startTime := time.Now()
	systemTaskCommand := commands.UpsertSystemTaskCommand{
		Type:                 models.HTML_TO_PDF,
		Status:               models.SYSTEM_TASK_SUCCEEDED,
		AssociatedEntityType: models.NOOP_ENTITY_TYPE,
		StartedAt:            startTime,
	}

	if len(html) == 0 {
		endTime := time.Now()
		systemTaskCommand.Status = models.SYSTEM_TASK_FAILED
		systemTaskCommand.EndedAt = &endTime
		systemTaskCommand.ResultDescription = "html content is empty"
		return nil, systemTaskCommand, errors.New("html content is empty")
	}

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(env.GetChromiumPath()),
		chromedp.NoSandbox,
		chromedp.Headless,
		chromedp.DisableGPU,
	)

	allocCtx, cancelAlloc := chromedp.NewExecAllocator(context.Background(), opts...)
	defer cancelAlloc()

	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx)
	defer cancelBrowser()

	timeoutCtx, cancelTimeout := context.WithTimeout(browserCtx, htmlToPdfTimeout)
	defer cancelTimeout()

	dataURL := "data:text/html;charset=utf-8;base64," + base64.StdEncoding.EncodeToString([]byte(html))

	var pdfBuf []byte
	err := chromedp.Run(timeoutCtx,
		chromedp.Navigate(dataURL),
		chromedp.ActionFunc(func(ctx context.Context) error {
			buf, _, err := page.PrintToPDF().WithPrintBackground(true).Do(ctx)
			if err != nil {
				return err
			}
			pdfBuf = buf
			return nil
		}),
	)

	endTime := time.Now()
	systemTaskCommand.EndedAt = &endTime
	elapsed := endTime.Sub(startTime)

	if err != nil {
		systemTaskCommand.Status = models.SYSTEM_TASK_FAILED
		systemTaskCommand.ResultDescription = err.Error()
		logging.LogStd(logging.LOG_LEVEL_ERROR, "HTML to PDF render failed: ", err.Error())
		return nil, systemTaskCommand, err
	}

	if !bytes.HasPrefix(pdfBuf, []byte("%PDF-")) {
		err = errors.New("chromedp returned non-PDF bytes")
		systemTaskCommand.Status = models.SYSTEM_TASK_FAILED
		systemTaskCommand.ResultDescription = err.Error()
		return nil, systemTaskCommand, err
	}

	systemTaskCommand.ResultDescription = "rendered " + elapsed.String()
	logging.LogStd(logging.LOG_LEVEL_INFO, "HTML to PDF render took: ", elapsed)
	return pdfBuf, systemTaskCommand, nil
}
