import unittest
from email.message import Message
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from unittest.mock import patch

from imap_client import ImapClient, strip_html_tags


class TestShouldSetUpClientCorrectly(unittest.TestCase):

    def test_constructor(self):
        client = ImapClient("host", "port", "username", "password", False, [], [])
        self.assertEqual(client.host, "host")
        self.assertEqual(client.port, "port")
        self.assertEqual(client.username, "username")
        self.assertEqual(client.password, "password")

    @patch('imap_client.IMAPClient')
    def test_catch_error_with_bad_connect(self, mock_imapclient):
        mock_imapclient.side_effect = Exception('Failed to connect')
        client = ImapClient("host", 993, "username", "password", False, [], [])
        with self.assertRaises(Exception) as context:
            client.connect()
        self.assertTrue('Failed to connect' in str(context.exception))

    def setUp(self):
        self.client = ImapClient('host', 'port', 'username', 'password', False, [], [])

    def test_get_formatted_to_or_from_data(self):
        message = Message()
        message['From'] = 'Test User <test@example.com>'
        result = self.client._get_formatted_to_or_from_data(message, 'From')
        self.assertEqual(result, {'name': 'Test User ', 'email': 'test@example.com'})

    def test_get_formatted_date(self):
        date = 'Wed, 20 Oct 2021 10:30:00 +0000'
        result = self.client.get_formatted_date(date)
        self.assertEqual(result, '2021-10-20T10:30:00.000000Z')

    def test_valid_mime_type(self):
        mime_type = 'image/jpeg'
        result = self.client.valid_mime_type(mime_type)
        self.assertTrue(result)

    def test_invalid_mime_type(self):
        mime_type = 'text/plain'
        result = self.client.valid_mime_type(mime_type)
        self.assertFalse(result)


class TestStripHtmlTags(unittest.TestCase):

    def test_strips_basic_html(self):
        html = '<p>Hello <b>World</b></p>'
        result = strip_html_tags(html)
        self.assertEqual(result, 'Hello World')

    def test_strips_complex_html(self):
        html = '<html><body><h1>Title</h1><p>Content</p></body></html>'
        result = strip_html_tags(html)
        self.assertEqual(result, 'TitleContent')

    def test_handles_empty_string(self):
        self.assertEqual(strip_html_tags(''), '')

    def test_returns_plain_text_unchanged(self):
        self.assertEqual(strip_html_tags('no html here'), 'no html here')


class TestGetBodyText(unittest.TestCase):

    def setUp(self):
        self.client = ImapClient('host', 'port', 'username', 'password', False, [], [])

    def test_get_body_text_plain_text(self):
        msg = MIMEText('This is a plain text receipt.', 'plain')
        result = self.client._get_body_text(msg)
        self.assertEqual(result, 'This is a plain text receipt.')

    def test_get_body_text_html_only(self):
        msg = MIMEText('<p>Your order total is <b>$45.00</b></p>', 'html')
        result = self.client._get_body_text(msg)
        self.assertEqual(result, 'Your order total is $45.00')

    def test_get_body_text_multipart_prefers_plain(self):
        msg = MIMEMultipart('alternative')
        msg.attach(MIMEText('Plain text version', 'plain'))
        msg.attach(MIMEText('<p>HTML version</p>', 'html'))
        result = self.client._get_body_text(msg)
        self.assertEqual(result, 'Plain text version')

    def test_get_body_text_no_body(self):
        msg = MIMEMultipart()
        attachment = MIMEBase('image', 'jpeg')
        attachment.set_payload(b'\xff\xd8\xff\xe0')
        encoders.encode_base64(attachment)
        attachment.add_header('Content-Disposition', 'attachment', filename='receipt.jpg')
        msg.attach(attachment)
        result = self.client._get_body_text(msg)
        self.assertEqual(result, '')

    def test_get_body_text_skips_attachments(self):
        msg = MIMEMultipart()
        # Add a body part
        msg.attach(MIMEText('Receipt body', 'plain'))
        # Add a text file as attachment
        text_attachment = MIMEText('Attached text content', 'plain')
        text_attachment.add_header('Content-Disposition', 'attachment', filename='notes.txt')
        msg.attach(text_attachment)
        result = self.client._get_body_text(msg)
        self.assertEqual(result, 'Receipt body')

    def test_get_body_text_strips_whitespace(self):
        msg = MIMEText('  Line one  \n\n\n\n  Line two  ', 'plain')
        result = self.client._get_body_text(msg)
        # Spaces collapse to single space, excessive newlines collapse to double
        self.assertEqual(result, 'Line one \n\n Line two')

    def test_get_body_text_multipart_html_fallback(self):
        msg = MIMEMultipart()
        msg.attach(MIMEText('<h1>Receipt</h1><p>Total: $10</p>', 'html'))
        result = self.client._get_body_text(msg)
        self.assertEqual(result, 'ReceiptTotal: $10')


class TestGetFormattedMessageDataWithBody(unittest.TestCase):

    def setUp(self):
        self.client = ImapClient('host', 'port', 'username', 'password', False, [], [])

    def _build_email_bytes(self, body_text=None, body_html=None, has_attachment=False):
        """Helper to build a raw RFC822 email as bytes."""
        msg = MIMEMultipart()
        msg['From'] = 'Sender <sender@example.com>'
        msg['To'] = 'Recipient <recipient@example.com>'
        msg['Subject'] = 'Test Receipt'
        msg['Date'] = 'Wed, 20 Oct 2021 10:30:00 +0000'

        if body_text:
            msg.attach(MIMEText(body_text, 'plain'))
        if body_html:
            msg.attach(MIMEText(body_html, 'html'))
        if has_attachment:
            attachment = MIMEBase('image', 'jpeg')
            attachment.set_payload(b'\xff\xd8\xff\xe0')
            encoders.encode_base64(attachment)
            attachment.add_header('Content-Disposition', 'attachment', filename='receipt.jpg')
            msg.attach(attachment)

        return {b"RFC822": msg.as_bytes()}

    def test_body_only_email_returns_metadata(self):
        data = self._build_email_bytes(body_text='Your order total: $25.00')
        result = self.client._get_formatted_message_data(data)
        self.assertNotEqual(result, {})
        self.assertEqual(result['body'], 'Your order total: $25.00')
        self.assertEqual(result['attachments'], [])

    def test_no_body_no_attachments_returns_empty(self):
        data = self._build_email_bytes()
        result = self.client._get_formatted_message_data(data)
        self.assertEqual(result, {})

    @patch.object(ImapClient, '_get_attachments')
    def test_includes_body_with_attachments(self, mock_get_attachments):
        mock_get_attachments.return_value = [
            {"filename": "receipt.jpg", "fileType": "image/jpeg", "size": 100}
        ]
        data = self._build_email_bytes(body_text='Order confirmation', has_attachment=True)
        result = self.client._get_formatted_message_data(data)
        self.assertNotEqual(result, {})
        self.assertEqual(result['body'], 'Order confirmation')
        self.assertEqual(len(result['attachments']), 1)


if __name__ == '__main__':
    unittest.main()
