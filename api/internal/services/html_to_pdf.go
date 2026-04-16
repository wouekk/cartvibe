package services

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
	"gorm.io/gorm"
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/env"
	"receipt-wrangler/api/internal/logging"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/utils"
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
		chromedp.Headless,
		chromedp.DisableGPU,
		chromedp.Flag("disable-javascript", true),
	)
	// Default behavior is --no-sandbox because the supported docker images
	// run as root, where chromium's sandbox refuses to start. Operators
	// running the API as a non-root user can opt back into the sandbox via
	// the CHROMIUM_SANDBOX env var.
	if !env.GetChromiumSandboxEnabled() {
		opts = append(opts, chromedp.NoSandbox)
	}

	allocCtx, cancelAlloc := chromedp.NewExecAllocator(context.Background(), opts...)
	defer cancelAlloc()

	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx)
	defer cancelBrowser()

	timeoutCtx, cancelTimeout := context.WithTimeout(browserCtx, htmlToPdfTimeout)
	defer cancelTimeout()

	// Stage HTML in a temp file rather than a data: URL — chromium has a
	// hard cap on data-URL length (a few MB depending on version) that
	// large receipt emails can exceed silently. file:// has no such cap.
	htmlPath, cleanup, err := writeTempHtml(html)
	if err != nil {
		endTime := time.Now()
		systemTaskCommand.Status = models.SYSTEM_TASK_FAILED
		systemTaskCommand.EndedAt = &endTime
		systemTaskCommand.ResultDescription = err.Error()
		return nil, systemTaskCommand, err
	}
	defer cleanup()

	var pdfBuf []byte
	err = chromedp.Run(timeoutCtx,
		chromedp.Navigate("file://"+htmlPath),
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

// writeTempHtml writes the HTML body to a uniquely-named temp file and
// returns its absolute path plus a cleanup function. The cleanup is a no-op
// if the file is already gone.
func writeTempHtml(html string) (string, func(), error) {
	randId, err := utils.GetRandomString(8)
	if err != nil {
		return "", func() {}, err
	}
	htmlPath := filepath.Join(os.TempDir(), "html-to-pdf-"+randId+".html")
	if err := utils.WriteFile(htmlPath, []byte(html)); err != nil {
		return "", func() {}, err
	}
	cleanup := func() {
		if err := os.Remove(htmlPath); err != nil && !os.IsNotExist(err) {
			logging.LogStd(logging.LOG_LEVEL_ERROR, "failed to remove html temp file: ", err.Error())
		}
	}
	return htmlPath, cleanup, nil
}
