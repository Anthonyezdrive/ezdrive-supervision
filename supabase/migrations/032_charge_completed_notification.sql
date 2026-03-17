-- ============================================================
-- Trigger: Push notification quand une charge est terminée
-- Appelle l'Edge Function push-notify via pg_net
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_charge_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_consumer_id UUID;
  v_energy NUMERIC;
  v_cost NUMERIC;
  v_body TEXT;
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Only fire when status changes to 'Completed' or 'Stopped'
  IF NEW.status NOT IN ('Completed', 'Stopped') THEN
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get consumer_id from the transaction
  v_consumer_id := NEW.consumer_id;
  IF v_consumer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate energy (Wh → kWh)
  v_energy := COALESCE(NEW.meter_stop - NEW.meter_start, 0) / 1000.0;

  -- Get CDR cost if available
  SELECT total_cost_incl_vat INTO v_cost
  FROM public.ocpi_cdrs
  WHERE id = NEW.cdr_id
  LIMIT 1;

  -- Build notification body
  v_body := format('Charge terminée — %s kWh', round(v_energy::numeric, 1));
  IF v_cost IS NOT NULL THEN
    v_body := v_body || format(' — %s €', round(v_cost::numeric, 2));
  END IF;

  -- Call push-notify via pg_net (async HTTP)
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/push-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'user_id', v_consumer_id::text,
        'title', 'Charge terminée',
        'body', v_body,
        'data', jsonb_build_object('type', 'charge_completed', 'transaction_id', NEW.id::text)
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_charge_completed_notify ON public.ocpp_transactions;

-- Create trigger on status update
CREATE TRIGGER trg_charge_completed_notify
  AFTER UPDATE OF status ON public.ocpp_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_charge_completed();
