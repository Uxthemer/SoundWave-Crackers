/*
  # Add Order Status Notification Trigger

  1. Changes
    - Add function to handle order status notifications
    - Add trigger for order status changes

  2. Security
    - Maintain existing RLS policies
*/

-- Create function to handle order status notifications
CREATE OR REPLACE FUNCTION notify_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when status changes
  IF OLD.status IS NULL OR OLD.status <> NEW.status THEN
    -- Call edge function to send notifications
    PERFORM
      net.http_post(
        url := current_setting('app.settings.edge_function_url') || '/notify-order-status',
        body := json_build_object(
          'orderId', NEW.id,
          'status', NEW.status,
          'customerName', NEW.full_name,
          'customerEmail', NEW.email,
          'customerPhone', NEW.phone
        )::text,
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for order status changes
DROP TRIGGER IF EXISTS order_status_notification ON orders;
CREATE TRIGGER order_status_notification
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_order_status_change();